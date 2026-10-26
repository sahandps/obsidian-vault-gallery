import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterMedia, getMetadata, mediaKind, moveMetadata, parseTags, removeMetadata, renamedPath, sanitizeData, type Filters, type MediaFile } from '../src/model';
const file = (path: string, size = 100, mtime = 10): MediaFile => ({ path, name: path.split('/').pop()!, extension: path.split('.').pop()!, stat: { ctime: 1, mtime, size } });
const filters: Filters = { query: '', kind: 'all', folder: null, tag: '', sort: 'newest' };
test('discovers media without treating arbitrary files as media', () => {
  assert.equal(mediaKind('JPG'), 'image');
  assert.equal(mediaKind('gif'), 'gif');
  assert.equal(mediaKind('mkv'), 'video');
  assert.equal(mediaKind('flac'), 'audio');
  assert.equal(mediaKind('pdf'), 'pdf');
  assert.equal(mediaKind('md'), undefined);
});
test('combines folder boundaries, type, tag and text filters', () => {
  const data = sanitizeData(null);
  data.metadata['Art/blue.jpg'] = { tags: ['ideas'], description: 'Ocean study' };
  const files = [file('Art/blue.jpg'), file('Artist/blue.jpg'), file('Art/nested/movie.mp4'), file('root.gif'), file('note.md')];
  assert.deepEqual(filterMedia(files, data, { ...filters, folder: 'Art' }).map(f => f.path), ['Art/blue.jpg', 'Art/nested/movie.mp4']);
  assert.deepEqual(filterMedia(files, data, { ...filters, query: 'ocean ideas', tag: 'ideas', kind: 'image' }).map(f => f.path), ['Art/blue.jpg']);
  assert.deepEqual(filterMedia(files, data, { ...filters, folder: '' }).map(f => f.path), ['root.gif']);
});
test('sorts modification time, size, and names numerically without mutating the input', () => {
  const files = [file('2.jpg', 400, 20), file('10.jpg', 100, 10), file('1.jpg', 200, 30)];
  const data = sanitizeData(null);
  assert.deepEqual(filterMedia(files, data, filters).map(f => f.name), ['1.jpg', '2.jpg', '10.jpg']);
  assert.deepEqual(filterMedia(files, data, { ...filters, sort: 'oldest' }).map(f => f.name), ['10.jpg', '2.jpg', '1.jpg']);
  assert.deepEqual(filterMedia(files, data, { ...filters, sort: 'largest' }).map(f => f.name), ['2.jpg', '1.jpg', '10.jpg']);
  assert.deepEqual(filterMedia(files, data, { ...filters, sort: 'name' }).map(f => f.name), ['1.jpg', '2.jpg', '10.jpg']);
  assert.equal(files[0].name, '2.jpg');
});
test('normalizes saved data and tags including hostile dictionary keys', () => {
  assert.deepEqual(parseTags(' #Travel, work, travel, , ##WORK '), ['travel', 'work']);
  const data = sanitizeData(JSON.parse('{"thumbnailSize":999,"metadata":{"__proto__":{"tags":["#Art",null,3],"description":"Study"},"broken":null}}'));
  assert.equal(data.thumbnailSize, 360);
  assert.deepEqual(getMetadata(data, '__proto__'), { tags: ['art'], description: 'Study' });
  assert.deepEqual(getMetadata(data, 'constructor'), { tags: [], description: '' });
  assert.equal(sanitizeData({ thumbnailSize: NaN }).thumbnailSize, 220);
});
test('moves and deletes folder metadata without touching similarly named folders', () => {
  const data = sanitizeData(null);
  for (const path of ['Art/a.jpg', 'Art/sub/b.gif', 'Artist/c.png']) data.metadata[path] = { tags: ['keep'], description: '' };
  moveMetadata(data, 'Art', 'Archive');
  assert.ok(data.metadata['Archive/sub/b.gif']);
  assert.equal(data.metadata['Art/a.jpg'], undefined);
  moveMetadata(data, 'Archive/a.jpg', 'Archive/renamed.jpg');
  assert.ok(data.metadata['Archive/renamed.jpg']);
  removeMetadata(data, 'Archive');
  assert.deepEqual(Object.keys(data.metadata), ['Artist/c.png']);
});


test('rename validates portable filenames and preserves directory and original extension', () => {
  assert.equal(renamedPath(file('Art/old.JPG'), ' New name '), 'Art/New name.JPG');
  assert.equal(renamedPath(file('old.png'), 'New'), 'New.png');
  for (const invalid of ['', '..', '../escape', 'sub/name', 'a\\b', 'a:b', 'nul', 'COM1', 'CON.jpg', 'trailing.', 'a' + String.fromCharCode(0) + 'b', 'a' + String.fromCharCode(31), 'a' + String.fromCharCode(127), 'a'.repeat(260)]) {
    assert.throws(() => renamedPath(file('old.png'), invalid));
  }
});
