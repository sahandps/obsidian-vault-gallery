import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';

const bundle = await build({ entryPoints: ['src/main.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, alias: { obsidian: resolve('tests/obsidian-mock.ts') } });
const module = { exports: {} as any };
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const GalleryPlugin = module.exports.default;
function file(path: string) {
  return { path, name: path.split('/').pop()!, extension: path.split('.').pop()!, parent: { path: path.includes('/') ? path.split('/').slice(0, -1).join('/') : '/' }, stat: { ctime: 1000, mtime: 2000, size: 200 } };
}
async function setup(files = [file('Art/photo.jpg'), file('video.mp4'), file('clip.gif'), file('music.mp3'), file('book.pdf')]) {
  const dom = new JSDOM('<div id="gallery"></div>');
  const doc = dom.window.document;
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
  const listeners = new Map<string, (...args: any[]) => void>();
  const leaf: any = { contentEl: doc.getElementById('gallery') };
  const opened: any[] = [];
  const plugin = new GalleryPlugin();
  const app = { vault: {
    getFiles: () => files,
    getAbstractFileByPath: (path: string) => files.find(item => item.path === path) || null,
    getResourcePath: () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
    on: (name: string, callback: (...args: any[]) => void) => { listeners.set(name, callback); return callback; },
  }, fileManager: {
    renameFile: async (file: any, newPath: string) => {
      const oldPath = file.path;
      file.path = newPath; file.name = newPath.split('/').pop()!;
      listeners.get('rename')?.(file, oldPath);
    },
  }, workspace: { getLeavesOfType: () => [leaf], getLeaf: () => ({ openFile: async (f: any) => opened.push(f) }) } };
  leaf.app = app; plugin.app = app;
  await plugin.onload();
  const view = plugin.factory(leaf); leaf.view = view;
  await view.onOpen();
  const click = (label: string) => {
    const node = doc.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    assert.ok(node, `Button ${label} exists`); node.click();
  };
  return { dom, doc, plugin, view, click, listeners, files, opened };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('gallery filters, opens preview, saves tags, reopens saved details, and opens original', async () => {
  const { doc, dom, plugin, view, click, opened } = await setup();
  assert.equal(doc.querySelectorAll('.vg-card').length, 5);
  click('Videos');
  assert.equal(doc.querySelectorAll('.vg-card').length, 1);
  click('Preview video.mp4');
  assert.ok(doc.querySelector('video[controls]'));
  assert.equal(doc.querySelector('video')?.autoplay, false);
  click('Images');
  click('Preview photo.jpg');
  assert.equal(doc.querySelector('.vg-preview')?.hasAttribute('hidden'), false);
  const tags = doc.querySelector<HTMLInputElement>('.vg-inspector input:not(.vg-filename)')!;
  tags.value = '#Travel, travel, blue';
  click('Save details'); await tick();
  assert.deepEqual(plugin.stored.metadata['Art/photo.jpg'].tags, ['travel', 'blue']);
  click('Close preview'); click('Preview photo.jpg');
  assert.equal(doc.querySelector<HTMLInputElement>('.vg-inspector input:not(.vg-filename)')!.value, 'travel, blue');
  click('Open in Obsidian'); await tick();
  assert.equal(opened[0].path, 'Art/photo.jpg');
  const tagFilter = doc.querySelector<HTMLSelectElement>('[aria-label="Filter by tag"]')!;
  tagFilter.value = 'travel'; tagFilter.dispatchEvent(new dom.window.Event('change'));
  assert.equal(doc.querySelectorAll('.vg-card').length, 1);
  const search = doc.querySelector<HTMLInputElement>('[aria-label="Search media"]')!;
  search.value = 'no-match'; search.dispatchEvent(new dom.window.Event('input'));
  assert.match(doc.querySelector('.vg-empty')!.textContent!, /No matching media/);
  assert.equal(doc.querySelector('.vg-preview')?.hasAttribute('hidden'), true);
  click('Clear filters');
  assert.equal(doc.querySelectorAll('.vg-card').length, 5);
  await view.onClose();
});

test('renaming folders preserves tags and deleting removes stale tags and selection', async () => {
  const { plugin, view, listeners, files, click, doc } = await setup();
  plugin.data.metadata['Art/photo.jpg'] = { tags: ['reference'], description: 'keep' };
  click('Preview photo.jpg');
  files[0].path = 'Archive/photo.jpg';
  listeners.get('rename')!({ path: 'Archive' }, 'Art');
  await tick(); view.refresh();
  assert.deepEqual(plugin.data.metadata['Archive/photo.jpg'].tags, ['reference']);
  assert.equal(plugin.data.metadata['Art/photo.jpg'], undefined);
  click('Preview photo.jpg');
  files.shift(); listeners.get('delete')!({ path: 'Archive/photo.jpg' });
  view.refresh();
  assert.equal(doc.querySelector('.vg-preview')?.hasAttribute('hidden'), true);
  assert.equal(plugin.data.metadata['Archive/photo.jpg'], undefined);
  plugin.onunload(); await view.onClose();
});

test('bounded initial rendering and explicit load more work without IntersectionObserver', async () => {
  const { doc, click, view } = await setup(Array.from({ length: 101 }, (_, i) => file(`photo-${i}.jpg`)));
  assert.equal(doc.querySelectorAll('.vg-card').length, 80);
  click('Load more (21 remaining)');
  assert.equal(doc.querySelectorAll('.vg-card').length, 101);
  assert.equal(doc.querySelector('.vg-load-more'), null);
  await view.onClose();
});

test('failed writes retain form values and offer retry; queued saves preserve order', async () => {
  const { doc, plugin, view, click } = await setup();
  click('Preview photo.jpg');
  const tags = doc.querySelector<HTMLInputElement>('.vg-inspector input:not(.vg-filename)')!;
  tags.value = 'new';
  plugin.saveData = async () => { throw new Error('disk full'); };
  const originalError = console.error;
  console.error = () => {};
  try { click('Save details'); await tick(); } finally { console.error = originalError; }
  assert.equal(tags.value, 'new');
  assert.equal(doc.querySelector<HTMLButtonElement>('.vg-save')!.disabled, false);
  assert.equal(doc.querySelector('.vg-save')!.textContent, 'Retry save');
  assert.deepEqual(plugin.data.metadata['Art/photo.jpg'].tags, []);
  const writes: number[] = [];
  plugin.saveData = async (data: any) => { await tick(); writes.push(data.thumbnailSize); };
  plugin.data.thumbnailSize = 150; const first = plugin.persist();
  plugin.data.thumbnailSize = 300; const second = plugin.persist();
  await Promise.all([first, second]);
  assert.deepEqual(writes, [150, 300]);
  await view.onClose();
});


test('rename preserves the extension, saved tags, draft details and selected preview', async () => {
  const { doc, dom, plugin, view, click, files } = await setup();
  plugin.data.metadata['Art/photo.jpg'] = { tags: ['saved'], description: 'Original' };
  click('Preview photo.jpg');
  const tags = doc.querySelector<HTMLInputElement>('.vg-inspector input:not(.vg-filename)')!;
  tags.value = 'unsaved';
  const name = doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!;
  name.value = '../bad'; click('Rename file');
  assert.match(doc.querySelector('.vg-rename-status')!.textContent!, /cannot contain/);
  assert.equal(files[0].path, 'Art/photo.jpg');
  name.value = 'New photo'; click('Rename file'); await tick();
  assert.equal(files[0].path, 'Art/New photo.jpg');
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value, 'New photo');
  assert.equal(doc.querySelector<HTMLInputElement>('.vg-inspector input:not(.vg-filename)')!.value, 'unsaved');
  assert.deepEqual(plugin.data.metadata['Art/New photo.jpg'].tags, ['saved']);
  assert.equal(plugin.data.metadata['Art/photo.jpg'], undefined);
  assert.ok(doc.querySelector('[aria-label="Preview New photo.jpg"][aria-pressed="true"]'));
  click('Save details'); await tick();
  assert.deepEqual(plugin.stored.metadata['Art/New photo.jpg'].tags, ['unsaved']);
  plugin.onunload(); await view.onClose();
});

test('rename refuses collisions and recovers from filesystem errors without losing drafts', async () => {
  const { doc, plugin, view, click, files } = await setup([file('Art/photo.jpg'), file('Art/taken.jpg')]);
  click('Preview photo.jpg');
  const name = doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!;
  name.value = 'taken'; click('Rename file');
  assert.match(doc.querySelector('.vg-rename-status')!.textContent!, /already exists/);
  assert.equal(files[0].path, 'Art/photo.jpg');
  plugin.app.fileManager.renameFile = async () => { throw new Error('Permission denied'); };
  name.value = 'new';
  const originalError = console.error; console.error = () => {};
  try { click('Rename file'); await tick(); } finally { console.error = originalError; }
  assert.match(doc.querySelector('.vg-rename-status')!.textContent!, /Permission denied/);
  assert.equal(name.disabled, false);
  assert.equal(name.value, 'new');
  assert.equal(files[0].path, 'Art/photo.jpg');
  await view.onClose();
});
