import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollection, filterMedia, getMetadata, mediaKind, moveMetadata, normalizeImportFolder, importPath, parseTags, removeMetadata, renamedPath, sanitizeData, type Filters, type MediaFile } from '../src/model';
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


test('import settings migrate old data without losing tags and reject paths outside the vault', () => {
  const data = sanitizeData({ thumbnailSize: 200, metadata: { 'photo.jpg': { tags: ['art'], description: 'Keep' } } });
  assert.equal(data.importFolder, 'Media'); assert.equal(data.sidebarCollapsed, false);
  assert.deepEqual(data.metadata['photo.jpg'].tags, ['art']);
  assert.equal(sanitizeData({ importFolder: '', sidebarCollapsed: true }).importFolder, '');
  assert.equal(sanitizeData({ importFolder: '../escape' }).importFolder, 'Media');
  assert.equal(normalizeImportFolder(' Assets//Photos/ '), 'Assets/Photos');
  for (const path of ['/outside', '../outside', 'Assets/../x', '.obsidian', 'C:/outside', 'a/NUL']) assert.throws(() => normalizeImportFolder(path));
  assert.equal(importPath('Media', 'a.PNG', 2), 'Media/a (2).PNG');
  assert.equal(importPath('', 'a.png'), 'a.png');
  assert.throws(() => importPath('Media', '../a.png'));
  assert.throws(() => importPath('Media', 'note.md'));
});


test('collections migrate, filter independently of folders, and follow file/folder lifecycle', () => {
  const data = sanitizeData(null); const first = createCollection(data, 'Travel', ['Art/a.jpg', 'Art/a.jpg', 'Artist/b.jpg']);
  assert.deepEqual(first.paths, ['Art/a.jpg', 'Artist/b.jpg']);
  assert.throws(() => createCollection(data, ' travel ')); assert.throws(() => createCollection(data, ' '));
  createCollection(data, 'Other', ['Art/a.jpg']);
  assert.deepEqual(filterMedia([file('Art/a.jpg'), file('Artist/b.jpg'), file('outside.jpg')], data, { ...filters, collection: first.id }).map(f => f.path), ['Art/a.jpg', 'Artist/b.jpg']);
  moveMetadata(data, 'Art', 'Archive');
  assert.deepEqual(first.paths, ['Archive/a.jpg', 'Artist/b.jpg']);
  removeMetadata(data, 'Archive');
  assert.deepEqual(first.paths, ['Artist/b.jpg']); assert.deepEqual(data.collections[1].paths, []);
  const copy = sanitizeData(data); copy.collections[0].paths.push('other.png');
  assert.deepEqual(data.collections[0].paths, ['Artist/b.jpg']);
  assert.deepEqual(filterMedia([file('outside.jpg')], data, { ...filters, collection: 'missing' }), []);
});
