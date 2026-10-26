import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { contents: "export {default} from './src/main'; export {TFolder as MockFolder, Platform as MockPlatform, CapacitorAdapter as MockCapacitorAdapter} from './tests/obsidian-mock';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, alias: { obsidian: resolve('tests/obsidian-mock.ts') } });
const module = { exports: {} as any };
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const GalleryPlugin = module.exports.default;
function file(path: string) {
  return { path, name: path.split('/').pop()!, extension: path.split('.').pop()!, parent: { path: path.includes('/') ? path.split('/').slice(0, -1).join('/') : '/' }, stat: { ctime: 1000, mtime: 2000, size: 200 } };
}
async function setup(files = [file('Art/photo.jpg'), file('video.mp4'), file('clip.gif'), file('music.mp3'), file('book.pdf')]) {
  const dom = new JSDOM('<div id="gallery"></div>');
  const doc = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
  const listeners = new Map<string, (...args: any[]) => void>();
  const leaf: any = { contentEl: doc.getElementById('gallery') };
  const opened: any[] = [];
  const plugin = new GalleryPlugin();
  const folders = new Map<string, any>();
  const created: string[] = [];
  const trashed: string[] = [];
  const app = { doc, vault: {
    getFiles: () => files,
    readBinary: async () => new Uint8Array([1, 2, 3]).buffer,
    getAbstractFileByPath: (path: string) => files.find(item => item.path === path) || folders.get(path) || null,
    getAllLoadedFiles: () => [...files, ...folders.values()],
    createFolder: async (path: string) => { const folder = new module.exports.MockFolder(path); folders.set(path, folder); return folder; },
    createBinary: async (path: string, _bytes: ArrayBuffer) => {
      if (files.some(item => item.path === path)) throw new Error('File exists');
      const createdFile = file(path); files.push(createdFile); created.push(path); return createdFile;
    },
    getResourcePath: () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
    on: (name: string, callback: (...args: any[]) => void) => { listeners.set(name, callback); return callback; },
  }, fileManager: {
    trashFile: async (target: any) => {
      const index = files.indexOf(target); if (index < 0) throw new Error('Missing file');
      trashed.push(target.path); files.splice(index, 1); listeners.get('delete')?.(target);
    },
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
  return { dom, doc, plugin, view, click, listeners, files, opened, created, folders, trashed };
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
  assert.deepEqual([...doc.querySelectorAll('.vg-inspector .vg-tag-chip > span')].map(node => node.textContent), ['#travel', '#blue']);
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
  assert.deepEqual([...doc.querySelectorAll('.vg-inspector .vg-tag-chip > span')].map(node => node.textContent), ['#saved', '#unsaved']);
  assert.deepEqual(plugin.data.metadata['Art/New photo.jpg'].tags, ['saved']);
  assert.equal(plugin.data.metadata['Art/photo.jpg'], undefined);
  assert.ok(doc.querySelector('[aria-label="Preview New photo.jpg"][aria-pressed="true"]'));
  click('Save details'); await tick();
  assert.deepEqual(plugin.stored.metadata['Art/New photo.jpg'].tags, ['saved', 'unsaved']);
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


const upload = (name: string): File => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

test('media imports create nested folders, keep duplicate files, and skip unsupported uploads', async () => {
  const { plugin, folders, view } = await setup();
  plugin.data.importFolder = 'Assets/Photos';
  const originalError = console.error; console.error = () => {};
  let result;
  try { result = await plugin.importMedia([upload('photo.png'), upload('photo.png'), upload('note.md')], () => {}); }
  finally { console.error = originalError; }
  assert.deepEqual(result.paths, ['Assets/Photos/photo.png', 'Assets/Photos/photo (1).png']);
  assert.deepEqual(result.failed, ['note.md']);
  assert.ok(folders.has('Assets')); assert.ok(folders.has('Assets/Photos'));
  plugin.onunload(); await view.onClose();
});

test('imports recover from a duplicate-name race and report write errors without overwriting files', async () => {
  const { plugin, files, view } = await setup(); plugin.data.importFolder = '';
  let first = true;
  plugin.app.vault.createBinary = async (path: string) => {
    if (first) { first = false; files.push(file(path)); throw new Error('File exists'); }
    files.push(file(path)); return files[files.length - 1];
  };
  const result = await plugin.importMedia([upload('photo.png')], () => {});
  assert.deepEqual(result.paths, ['photo (1).png']);
  assert.ok(files.some((f: any) => f.path === 'photo.png'));
  plugin.app.vault.createBinary = async () => { throw new Error('Disk full'); };
  const originalError = console.error; console.error = () => {};
  try { assert.deepEqual((await plugin.importMedia([upload('another.png')], () => {})).failed, ['another.png']); }
  finally { console.error = originalError; }
  await view.onClose();
});

test('folder pane collapse persists and settings save the destination and layout', async () => {
  const { doc, dom, plugin, view, click } = await setup();
  click('Toggle folder pane'); await tick();
  assert.equal(doc.querySelector<HTMLElement>('.vg-sidebar')!.hidden, true);
  assert.equal(plugin.stored.sidebarCollapsed, true);
  assert.equal(doc.querySelector('[aria-label="Toggle folder pane"]')!.getAttribute('aria-expanded'), 'false');
  click('Gallery settings');
  const destination = doc.querySelector<HTMLInputElement>('[aria-label="Default media folder"]')!;
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="Default thumbnail size"]')!.value, String(plugin.data.thumbnailSize));
  destination.value = '../outside';
  const save = [...doc.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Save settings')!;
  save.click(); await tick();
  assert.equal(plugin.data.importFolder, 'Media');
  destination.value = 'Imported/Images';
  const collapsed = doc.querySelector<HTMLInputElement>('.vg-setting-check input')!; collapsed.checked = false;
  const size = doc.querySelector<HTMLInputElement>('[aria-label="Default thumbnail size"]')!; size.value = '300';
  save.click(); await tick();
  assert.equal(plugin.stored.importFolder, 'Imported/Images');
  assert.equal(plugin.stored.thumbnailSize, 300);
  assert.equal(doc.querySelector<HTMLElement>('.vg-sidebar')!.hidden, false);
  doc.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
  const picker = doc.querySelector<HTMLInputElement>('[aria-label="Choose media files"]')!;
  Object.defineProperty(picker, 'files', { value: [upload('added.png')] });
  picker.dispatchEvent(new dom.window.Event('change')); await tick();
  assert.ok(doc.querySelector('[aria-label="Preview added.png"]'));
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value, 'added');
  assert.equal(doc.querySelector<HTMLButtonElement>('[aria-label="Add media"]')!.disabled, false);
  plugin.onunload(); await view.onClose();
});


test('tag chips commit on Enter and comma, suggest existing tags, and remove independently', async () => {
  const { doc, dom, plugin, view, click } = await setup();
  plugin.data.metadata['video.mp4'] = { tags: ['travel', 'work'], description: '' };
  click('Preview photo.jpg');
  const input = doc.querySelector<HTMLInputElement>('[aria-label="Tags"]')!;
  input.value = 'tra'; input.dispatchEvent(new dom.window.Event('input'));
  assert.ok(doc.querySelector('[role="option"]'));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  input.value = 'blue'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ',', bubbles: true }));
  input.value = '#TRAVEL'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(doc.querySelectorAll('.vg-inspector .vg-tag-chip').length, 2);
  click('Remove tag blue');
  click('Save details'); await tick();
  assert.deepEqual(plugin.stored.metadata['Art/photo.jpg'].tags, ['travel']);
  await view.onClose();
});

test('checkbox selection supports ranges, bulk tags preserve descriptions, and filters prune selection', async () => {
  const { doc, dom, plugin, view, click } = await setup();
  plugin.data.metadata['Art/photo.jpg'] = { tags: ['old'], description: 'Keep this' };
  const checkboxes = [...doc.querySelectorAll<HTMLInputElement>('.vg-select-checkbox')];
  checkboxes[0].click();
  checkboxes[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
  assert.equal(doc.querySelectorAll('.vg-select-checkbox:checked').length, 3);
  assert.equal(doc.querySelector<HTMLElement>('.vg-preview')!.hidden, true);
  const paths = [...doc.querySelectorAll<HTMLElement>('.vg-card[data-selected="true"]')].map(card => card.dataset.path!);
  click('Add tags');
  const input = doc.querySelector<HTMLInputElement>('[aria-label="Tags to add"]')!;
  input.value = 'shared'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const modal = doc.querySelector('[role="dialog"]')!;
  [...modal.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Apply tags')!.click(); await tick();
  for (const path of paths) assert.ok(plugin.stored.metadata[path].tags.includes('shared'));
  assert.equal(plugin.stored.metadata['Art/photo.jpg'].description, 'Keep this');
  assert.ok(plugin.stored.metadata['Art/photo.jpg'].tags.includes('old'));
  click('Videos');
  assert.equal(doc.querySelectorAll('.vg-select-checkbox:checked').length, 0);
  assert.equal(doc.querySelector<HTMLElement>('.vg-selection-bar')!.hidden, true);
  await view.onClose();
});

test('collections allow multiple membership; removing membership never deletes files', async () => {
  const { doc, plugin, view, click, files, trashed } = await setup();
  doc.querySelector<HTMLInputElement>('[aria-label="Select photo.jpg"]')!.click();
  const addCollection = async (name: string) => {
    click('Add to collection');
    doc.querySelector<HTMLInputElement>('[aria-label="New collection name"]')!.value = name;
    const modal = doc.querySelector('[role="dialog"]')!;
    [...modal.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Add to collection')!.click(); await tick();
  };
  await addCollection('Travel'); await addCollection('References');
  assert.equal(plugin.data.collections.length, 2);
  for (const collection of plugin.data.collections) assert.deepEqual(collection.paths, ['Art/photo.jpg']);
  click('Collection Travel');
  assert.equal(doc.querySelectorAll('.vg-card').length, 1);
  click('Remove from collection'); await tick();
  assert.equal(plugin.data.collections.find((c: any) => c.name === 'Travel').paths.length, 0);
  assert.deepEqual(plugin.data.collections.find((c: any) => c.name === 'References').paths, ['Art/photo.jpg']);
  assert.equal(files.length, 5); assert.deepEqual(trashed, []);
  await view.onClose();
});

test('deletion requires explicit confirmation and reports partial trash failures', async () => {
  const { doc, plugin, view, click, files, trashed } = await setup();
  const targets = [files[0], files[1]];
  plugin.data.collections.push({ id: 'one', name: 'Keep', paths: targets.map(f => f.path) });
  for (const target of targets) doc.querySelector<HTMLInputElement>(`[aria-label="Select ${target.name}"]`)!.click();
  click('Delete files');
  assert.match(doc.querySelector('[role="dialog"]')!.textContent!, /Delete 2 files/);
  assert.deepEqual(trashed, []);
  [...doc.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === 'Cancel')!.click();
  assert.equal(files.length, 5);
  click('Delete files');
  const originalTrash = plugin.app.fileManager.trashFile;
  plugin.app.fileManager.trashFile = async (file: any) => { if (file === targets[1]) throw new Error('Permission denied'); await originalTrash(file); };
  const originalError = console.error; console.error = () => {};
  try {
    [...doc.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === 'Move 2 files to trash')!.click(); await tick();
  } finally { console.error = originalError; }
  assert.deepEqual(trashed, ['Art/photo.jpg']);
  assert.ok(files.includes(targets[1]));
  assert.deepEqual(plugin.data.collections[0].paths, ['video.mp4']);
  assert.match(doc.querySelector('[role="dialog"]')!.textContent!, /Could not delete 1/);
  plugin.onunload(); await view.onClose();
});

test('trash does not delete a file renamed after confirmation and metadata writes roll back on error', async () => {
  const { plugin, view, files } = await setup();
  const target = { file: files[0], path: files[0].path }; files[0].path = 'Art/renamed.jpg';
  assert.deepEqual((await plugin.trashMedia([target])).failed, ['Art/photo.jpg']);
  assert.ok(files.includes(target.file));
  plugin.saveData = async () => { throw new Error('Disk full'); };
  await assert.rejects(plugin.mutateData((data: any) => { data.collections.push({ id: 'new', name: 'New', paths: [] }); data.metadata['video.mp4'] = { tags: ['unsaved'], description: '' }; }));
  assert.deepEqual(plugin.data.collections, []); assert.equal(plugin.data.metadata['video.mp4'], undefined);
  await view.onClose();
});

test('Save details commits a changed filename together with draft tags and description', async () => {
  const { doc, plugin, view, click, files } = await setup();
  click('Preview photo.jpg');
  doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value = 'Renamed from save';
  doc.querySelector<HTMLInputElement>('[aria-label="Tags"]')!.value = 'new';
  doc.querySelector<HTMLTextAreaElement>('textarea')!.value = 'New description';
  click('Save details'); await tick(); await tick();
  assert.equal(files[0].path, 'Art/Renamed from save.jpg');
  assert.deepEqual(plugin.stored.metadata['Art/Renamed from save.jpg'], { tags: ['new'], description: 'New description' });
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value, 'Renamed from save');
  await view.onClose();
});
test('Save details leaves file and details unchanged if filename is invalid', async () => {
  const { doc, plugin, view, click, files } = await setup();
  click('Preview photo.jpg');
  doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value = '../bad';
  doc.querySelector<HTMLInputElement>('[aria-label="Tags"]')!.value = 'unsaved';
  click('Save details'); await tick();
  assert.equal(files[0].path, 'Art/photo.jpg');
  assert.equal(plugin.data.metadata['Art/photo.jpg'], undefined);
  assert.match(doc.querySelector('.vg-rename-status')!.textContent!, /cannot contain/);
  await view.onClose();
});
test('download has no Share button and prepares original-file copies', async () => {
  const { doc, view, click, trashed } = await setup();
  click('Preview photo.jpg'); click('Download'); await tick();
  assert.equal(doc.querySelector<HTMLButtonElement>('[aria-label="Save to device"]')!.disabled, false);
  assert.equal(doc.querySelector('[aria-label="Share / Save to Files"]'), null);
  assert.deepEqual(trashed, []);
  await view.onClose();
});
test('download reports read errors and never offers incomplete output', async () => {
  const { doc, plugin, view, click } = await setup();
  plugin.app.vault.readBinary = async () => { throw new Error('Unreadable media'); };
  click('Select all'); click('Download'); await tick();
  assert.match(doc.querySelector('.vg-action-modal')!.textContent!, /Unreadable media/);
  assert.equal(doc.querySelector<HTMLButtonElement>('[aria-label="Save to device"]')!.disabled, true);
  await view.onClose();
});

test('checked media does not block previous/next buttons or keyboard arrows from a checkbox', async () => {
  const { doc, dom, view, click } = await setup();
  click('Preview book.pdf');
  const checkbox = doc.querySelector<HTMLInputElement>('[aria-label="Select book.pdf"]')!;
  checkbox.click(); checkbox.focus();
  checkbox.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value, 'clip');
  assert.equal(checkbox.checked, true);
  click('Next media');
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value, 'music');
  click('Previous media');
  assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="File name"]')!.value, 'clip');
  assert.equal(checkbox.checked, true);
  await view.onClose();
});


test('Android Download uses native Documents copies instead of browser downloads or sharing', async () => {
  const { doc, dom, plugin, view, click } = await setup();
  const copied: any[] = [];
  (dom.window as any).Capacitor = { Plugins: { Filesystem: { mkdir: async () => {}, writeFile: async (options: any) => { copied.push(options); }, appendFile: async () => {} } } };
  plugin.app.vault.adapter = new module.exports.MockCapacitorAdapter();
  plugin.app.vault.readBinary = async () => new Uint8Array([1, 2, 3]).buffer;
  module.exports.MockPlatform.isAndroidApp = true;
  try {
    click('Select all'); click('Download'); await tick();
    assert.equal(doc.querySelector('[aria-label="Share / Save to Files"]'), null);
    click('Save to device'); await tick();
    assert.equal(copied.length, 5);
    assert.equal(copied[0].directory, 'DOCUMENTS');
    assert.match(doc.querySelector('.vg-action-modal')!.textContent!, /Saved 5 of 5/);
  } finally { module.exports.MockPlatform.isAndroidApp = false; await view.onClose(); }
});

test('media tabs override checked selection and preview; select all toggles to deselect all', async () => {
  const { doc, view, click } = await setup();
  click('Preview photo.jpg'); click('Select all');
  assert.equal(doc.querySelectorAll('.vg-select-checkbox:checked').length, 5);
  click('Deselect all');
  assert.equal(doc.querySelectorAll('.vg-select-checkbox:checked').length, 0);
  click('Select all'); click('Videos');
  assert.equal(doc.querySelectorAll('.vg-card').length, 1);
  assert.equal(doc.querySelectorAll('.vg-select-checkbox:checked').length, 0);
  assert.equal(doc.querySelector<HTMLElement>('.vg-preview')!.hidden, true);
  assert.equal(doc.querySelector('[aria-label="Preview video.mp4"]') !== null, true);
  click('All media'); assert.equal(doc.querySelectorAll('.vg-card').length, 5);
  await view.onClose();
});
test('personalization saves and applies fit, density, labels, videos and default sort', async () => {
  const { doc, plugin, view, click } = await setup();
  click('Gallery settings');
  doc.querySelector<HTMLSelectElement>('[aria-label="Thumbnail fit"]')!.value = 'contain';
  doc.querySelector<HTMLSelectElement>('[aria-label="Default sort order"]')!.value = 'name';
  doc.querySelector<HTMLInputElement>('[aria-label="Compact spacing"]')!.checked = true;
  doc.querySelector<HTMLInputElement>('[aria-label="Show filenames"]')!.checked = false;
  doc.querySelector<HTMLInputElement>('[aria-label="Show tags and file details on cards"]')!.checked = false;
  doc.querySelector<HTMLInputElement>('[aria-label="Show video thumbnails"]')!.checked = false;
  const save = [...doc.querySelectorAll('button')].find(node => node.textContent === 'Save settings')!;
  save.click(); await tick();
  assert.equal(plugin.stored.thumbnailFit, 'contain'); assert.equal(plugin.stored.defaultSort, 'name');
  assert.equal(doc.querySelector('.vg-root')!.classList.contains('vg-compact'), true);
  assert.equal(doc.querySelector('.vg-root')!.classList.contains('vg-hide-filenames'), true);
  assert.equal(doc.querySelector('.vg-video-thumbnail'), null);
  await view.onClose();
});
test('video cards prepare a muted thumbnail frame without autoplay and retain fallback on errors', async () => {
  const { doc, dom, view, click } = await setup();
  click('Videos');
  const thumb = doc.querySelector<HTMLVideoElement>('.vg-video-thumbnail')!;
  assert.ok(thumb); assert.equal(thumb.muted, true); assert.equal(thumb.autoplay, false);
  assert.equal(thumb.preload, 'metadata');
  thumb.dispatchEvent(new dom.window.Event('loadeddata')); assert.equal(thumb.classList.contains('is-ready'), true);
  thumb.dispatchEvent(new dom.window.Event('error')); assert.equal(doc.querySelector('.vg-video-thumbnail'), null);
  assert.match(doc.querySelector('.vg-thumb')!.textContent!, /Select to play/);
  await view.onClose();
});
