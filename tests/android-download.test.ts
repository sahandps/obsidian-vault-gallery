import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveAndroidFiles, androidFilesystem, type AndroidFilesystem } from '../src/android-download';

test('Android copies originals directly to Documents and keeps duplicate names distinct', async () => {
  const writes: any[] = [];
  const fs: AndroidFilesystem = {
    mkdir: async options => { writes.push(options); },
    copy: async options => { writes.push(options); },
    checkPermissions: async () => ({ publicStorage: 'granted' }),
  };
  const result = await saveAndroidFiles(fs, [{ path: 'Art/photo.jpg', source: '/vault/Art/photo.jpg' }, { path: 'Other/photo.jpg', source: '/vault/Other/photo.jpg' }]);
  assert.equal(writes[0].directory, 'DOCUMENTS'); assert.equal(writes[0].recursive, true);
  assert.equal(writes[1].from, '/vault/Art/photo.jpg'); assert.equal(writes[1].toDirectory, 'DOCUMENTS');
  assert.equal(writes[1].to, `${result.folder}/photo.jpg`);
  assert.equal(writes[2].to, `${result.folder}/photo (1).jpg`);
  assert.deepEqual(result.failed, []); assert.equal(result.saved.length, 2);
});
test('Android reports partial failures and never claims a blocked save succeeded', async () => {
  let count = 0;
  const fs: AndroidFilesystem = { mkdir: async () => {}, copy: async () => { if (++count === 2) throw new Error('Storage full'); } };
  const result = await saveAndroidFiles(fs, [{ path: 'a.png', source: '/a.png' }, { path: 'b.png', source: '/b.png' }]);
  assert.deepEqual(result.saved, ['a.png']); assert.deepEqual(result.failed, ['b.png']);
  fs.mkdir = async () => { throw new Error('Permission denied'); };
  await assert.rejects(saveAndroidFiles(fs, [{ path: 'a.png', source: '/a.png' }]), /Permission denied/);
  assert.equal(androidFilesystem({} as Window), undefined);
});
test('Android requests storage permission only when necessary and stops on denial', async () => {
  let copied = false;
  const fs: AndroidFilesystem = { mkdir: async () => {}, copy: async () => { copied = true; }, checkPermissions: async () => ({ publicStorage: 'prompt' }), requestPermissions: async () => ({ publicStorage: 'denied' }) };
  await assert.rejects(saveAndroidFiles(fs, [{ path: 'a.png', source: '/a.png' }]), /Storage permission/);
  assert.equal(copied, false);
});
