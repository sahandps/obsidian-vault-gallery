import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canThumbnail, fitWithin, thumbnailSignature } from '../../src/backend/media/thumbnail-math';

test('thumbnails shrink the longest side and keep the aspect ratio', () => {
  assert.deepEqual(fitWithin(4000, 3000, 480), { width: 480, height: 360 });
  assert.deepEqual(fitWithin(3000, 6000, 480), { width: 240, height: 480 });
});
test('small or invalid images are left alone', () => {
  assert.equal(fitWithin(300, 200, 480), null);
  assert.equal(fitWithin(480, 480, 480), null);
  assert.equal(fitWithin(0, 100, 480), null);
});
test('only widely decodable formats get generated thumbnails', () => {
  assert.equal(canThumbnail('JPG'), true);
  assert.equal(canThumbnail('png'), true);
  assert.equal(canThumbnail('svg'), false);
  assert.equal(canThumbnail('gif'), false);
  assert.equal(canThumbnail('heic'), false);
});
test('the signature changes when the file or thumbnail size changes', () => {
  const file = { stat: { mtime: 10, size: 20 } };
  assert.notEqual(thumbnailSignature(file, 480), thumbnailSignature({ stat: { mtime: 11, size: 20 } }, 480));
  assert.notEqual(thumbnailSignature(file, 480), thumbnailSignature(file, 240));
});
