import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportPayload } from '../src/export-media';

test('downloads preserve original bytes, filenames and formats without an archive', async () => {
  const originals = [{ path: 'Art/café.jpg', bytes: new Uint8Array([0, 255, 12]).buffer }, { path: 'Other/café.jpg', bytes: new Uint8Array([3, 4]).buffer }];
  const files = exportPayload(originals);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map(file => file.name), ['café.jpg', 'café.jpg']);
  assert.equal(files[0].type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()), new Uint8Array(originals[0].bytes));
  assert.deepEqual(new Uint8Array(await files[1].arrayBuffer()), new Uint8Array(originals[1].bytes));
  assert.throws(() => exportPayload([]));
});
