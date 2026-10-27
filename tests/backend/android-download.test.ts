import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveAndroidFiles, androidFilesystem, type AndroidFilesystem } from '../../src/backend/services/android-download';
globalThis.window = globalThis as unknown as Window & typeof globalThis;
const read = async () => new Uint8Array([0, 255, 12]).buffer;

test('Android writes vault bytes to Documents without relying on filesystem paths', async () => {
  const writes: any[] = [];
  const fs: AndroidFilesystem = { mkdir: async options => { writes.push(options); }, writeFile: async options => { writes.push(options); }, appendFile: async () => {}, stat: async () => ({ size: 3 }) };
  const result = await saveAndroidFiles(fs, [{ path: 'Art/photo.jpg', read }, { path: 'Other/photo.jpg', read }]);
  assert.equal(writes[0].directory, 'DOCUMENTS');
  assert.equal(writes[1].toDirectory, undefined);
  assert.deepEqual([...Buffer.from(writes[1].data, 'base64')], [0, 255, 12]);
  assert.equal(writes[2].path, `${result.folder}/photo (1).jpg`);
  assert.equal(result.saved.length, 2);
});
test('Android reports native error messages and verifies saved sizes', async () => {
  const fs: AndroidFilesystem = { mkdir: async () => {}, writeFile: async () => { throw new Error('Permission denied'); }, appendFile: async () => {} };
  const result = await saveAndroidFiles(fs, [{ path: 'a.png', read }]);
  assert.match(result.failed[0], /Permission denied/); assert.equal(result.saved.length, 0);
  fs.writeFile = async () => {}; fs.stat = async () => ({ size: 1 });
  assert.match((await saveAndroidFiles(fs, [{ path: 'a.png', read }])).failed[0], /size does not match/);
  assert.equal(androidFilesystem({} as Window), undefined);
});
test('Android native bridge fallback and permission denial are handled', async () => {
  const calls: string[] = [];
  const fs = androidFilesystem({ Capacitor: { nativePromise: async (_plugin: string, method: string) => { calls.push(method); return {}; } } } as unknown as Window)!;
  await fs.mkdir({ path: 'test', directory: 'DOCUMENTS', recursive: true });
  assert.deepEqual(calls, ['mkdir']);
  fs.checkPermissions = async () => ({ publicStorage: 'prompt' }); fs.requestPermissions = async () => ({ publicStorage: 'denied' });
  await assert.rejects(saveAndroidFiles(fs, [{ path: 'a.png', read }]), /Storage permission/);
});

test('Android chunked writes preserve binary data across append boundaries', async () => {
  const original = Uint8Array.from({ length: 1100000 }, (_, index) => index % 256);
  const chunks: Uint8Array[] = [];
  const fs: AndroidFilesystem = {
    mkdir: async () => {},
    writeFile: async options => { chunks.push(Buffer.from(options.data, 'base64')); },
    appendFile: async options => { chunks.push(Buffer.from(options.data, 'base64')); },
    stat: async () => ({ size: original.length }),
  };
  const result = await saveAndroidFiles(fs, [{ path: 'video.mp4', read: async () => original.buffer }]);
  assert.equal(chunks.length, 3); assert.equal(result.saved.length, 1);
  assert.deepEqual(new Uint8Array(Buffer.concat(chunks)), original);
});
