// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

import { ItemView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf, setIcon } from 'obsidian';
import {
  createCollection, filterMedia, formatSize, getMetadata, importPath, mediaAccept, mediaKind, normalizeImportFolder, moveMetadata, parseTags,
  removeMetadata, renamedPath, sanitizeData, type Filters, type GalleryData, type MediaKind, type SortOrder,
} from './model';

import { TagEditor } from './tag-editor';
import { GalleryActionModal } from './action-modal';
import { GallerySettingsModal, GallerySettingsTab } from './settings';

const VIEW_TYPE = 'vault-gallery';
const PAGE_SIZE = 80;
const KINDS: { value: MediaKind | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All media', icon: 'layout-grid' },
  { value: 'image', label: 'Images', icon: 'image' },
  { value: 'gif', label: 'GIFs', icon: 'clapperboard' },
  { value: 'video', label: 'Videos', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'music' },
  { value: 'pdf', label: 'PDFs', icon: 'file-text' },
];
function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  return parent.createEl(tag, { cls, text });
}
function button(parent: HTMLElement, label: string, icon: string | null, action: () => void, cls = ''): HTMLButtonElement {
  const node = el(parent, 'button', cls);
  node.type = 'button';
  node.title = label;
  node.setAttribute('aria-label', label);
  if (icon) setIcon(el(node, 'span', 'vg-icon'), icon);
  else node.textContent = label;
  node.addEventListener('click', action);
  return node;
}
function stopMedia(root: HTMLElement): void {
  root.querySelectorAll('video, audio').forEach(node => {
    const media = node as HTMLMediaElement;
    media.pause();
    media.removeAttribute('src');
    media.load();
  });
}

export default class MediaHubPlugin extends Plugin {
  data: GalleryData = sanitizeData(null);
  private saveQueue: Promise<void> = Promise.resolve();
  private refreshTimer: number | undefined;

  async onload(): Promise<void> {
    try { this.data = sanitizeData(await this.loadData()); }
    catch (error) {
      console.error('Media Hub could not load its data', error);
      new Notice('Media Hub could not load saved tags. Reload the plugin before editing tags.');
      // Do not overwrite an unreadable metadata file with defaults.
      return;
    }
    this.addSettingTab(new GallerySettingsTab(this.app, this));
    this.registerView(VIEW_TYPE, leaf => new GalleryView(leaf, this));
    this.addRibbonIcon('images', 'Open Media Hub', () => { void this.activate(); });
    this.addCommand({ id: 'open-gallery', name: 'Open gallery', callback: () => { void this.activate(); } });
    this.registerEvent(this.app.vault.on('create', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('modify', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      moveMetadata(this.data, oldPath, file.path);
      if (file instanceof TFolder && (this.data.importFolder === oldPath || this.data.importFolder.startsWith(`${oldPath}/`))) {
        this.data.importFolder = file.path + this.data.importFolder.slice(oldPath.length);
      }
      for (const view of this.views()) view.onPathMoved(oldPath, file.path);
      void this.persist().catch(error => this.reportSaveError(error));
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      removeMetadata(this.data, file.path);
      void this.persist().catch(error => this.reportSaveError(error));
      this.scheduleRefresh();
    }));
  }

  onunload(): void { if (this.refreshTimer) window.clearTimeout(this.refreshTimer); }

  private views(): GalleryView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map(leaf => leaf.view as GalleryView);
  }
  private async activate(): Promise<void> {
    try {
      let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) {
        leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error(error);
      new Notice('Could not open Media Hub. See the developer console for details.');
    }
  }
  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => this.refreshViews(), 180);
  }
  applyViewSettings(): void { for (const view of this.views()) view.applySettings(); }
  async importMedia(files: readonly File[], progress: (message: string) => void): Promise<{ paths: string[]; failed: string[] }> {
    const folder = normalizeImportFolder(this.data.importFolder);
    const paths: string[] = [];
    const failed: string[] = [];
    // Make parent folders lazily; never overwrite a file or race another writer.
    const ensureFolder = async () => {
      let path = '';
      for (const part of folder.split('/').filter(Boolean)) {
        path = path ? `${path}/${part}` : part;
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing && !(existing instanceof TFolder)) throw new Error(`A file blocks the folder: ${path}`);
        if (!existing) {
          try { await this.app.vault.createFolder(path); }
          catch (error) { if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw error; }
        }
      }
    };
    for (const [index, file] of files.entries()) {
      progress(`Importing ${index + 1} of ${files.length}…`);
      try {
        // Validate the file before creating any folders or reading its bytes.
        importPath(folder, file.name);
        await ensureFolder();
        const bytes = await file.arrayBuffer();
        let saved = false;
        for (let suffix = 0; suffix < 10000; suffix++) {
          const path = importPath(folder, file.name, suffix);
          if (this.app.vault.getAbstractFileByPath(path)) continue;
          try {
            await this.app.vault.createBinary(path, bytes);
            paths.push(path); saved = true; break;
          } catch (error) {
            if (!this.app.vault.getAbstractFileByPath(path)) throw error;
          }
        }
        if (!saved) throw new Error('Could not find an available file name.');
      } catch (error) {
        console.error('Media Hub import failed', file.name, error);
        failed.push(file.name);
      }
    }
    this.refreshViews();
    return { paths, failed };
  }
  refreshViews(): void { for (const view of this.views()) view.refresh(); }
  persist(): Promise<void> {
    // Snapshot every write and serialize them, so a slow older write cannot replace newer tags.
    const snapshot = sanitizeData(this.data);
    const write = this.saveQueue.catch(() => undefined).then(() => this.saveData(snapshot));
    this.saveQueue = write;
    return write;
  }
  async mutateData(change: (data: GalleryData) => void): Promise<void> {
    const previous = sanitizeData(this.data);
    change(this.data);
    const next = sanitizeData(this.data);
    try { await this.persist(); }
    catch (error) {
      // Roll back changed fields only if another operation has not since changed them.
      for (const path of new Set([...Object.keys(previous.metadata), ...Object.keys(next.metadata)])) {
        if (JSON.stringify(previous.metadata[path]) === JSON.stringify(next.metadata[path])) continue;
        if (JSON.stringify(this.data.metadata[path]) !== JSON.stringify(next.metadata[path])) continue;
        if (Object.prototype.hasOwnProperty.call(previous.metadata, path)) this.data.metadata[path] = previous.metadata[path];
        else delete this.data.metadata[path];
      }
      if (JSON.stringify(this.data.collections) === JSON.stringify(next.collections)) this.data.collections = previous.collections;
      throw error;
    }
    this.refreshViews();
  }
  async trashMedia(targets: readonly { file: TFile; path: string }[]): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [], failed: string[] = [];
    for (const target of targets) {
      // A confirmation applies to these exact files, not replacements or renamed files.
      if (target.file.path !== target.path || !this.app.vault.getFiles().includes(target.file)) { failed.push(target.path); continue; }
      try {
        await this.app.fileManager.trashFile(target.file);
        removeMetadata(this.data, target.path); deleted.push(target.path);
      } catch (error) { console.error('Media Hub could not move a file to trash', error); failed.push(target.path); }
    }
    if (deleted.length) {
      try { await this.persist(); } catch (error) { this.reportSaveError(error); }
    }
    this.refreshViews();
    return { deleted, failed };
  }
  reportSaveError(error: unknown): void {
    console.error('Media Hub save failed', error);
    new Notice('Could not save gallery data. Check that your vault is writable.');
  }
}

export class GalleryView extends ItemView {
  private filters: Filters = { query: '', kind: 'all', folder: null, tag: '', sort: 'newest' };
  private selectedPath: string | null = null;
  private selectedPaths = new Set<string>();
  private selectionAnchor: string | null = null;
  private selectionBar!: HTMLElement;
  private tagEditor: TagEditor | null = null;
  private files: TFile[] = [];
  private filtered: TFile[] = [];
  private visibleCount = PAGE_SIZE;
  private observer: IntersectionObserver | null = null;
  private sidebar!: HTMLElement;
  private sidebarToggle!: HTMLButtonElement;
  private thumbnailSlider!: HTMLInputElement;
  private grid!: HTMLElement;
  private preview!: HTMLElement;
  private counter!: HTMLElement;
  private tagSelect!: HTMLSelectElement;
  private search!: HTMLInputElement;
  private folderTitle!: HTMLElement;
  private tabs = new Map<string, HTMLButtonElement>();
  private zoom = 1;
  private renaming = false;
  private previewImage: HTMLImageElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: MediaHubPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Media Hub'; }
  getIcon(): string { return 'images'; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.replaceChildren();
    root.classList.add('vg-root');
    root.tabIndex = -1;
    this.sidebar = el(root, 'aside', 'vg-sidebar');
    this.sidebar.setAttribute('aria-label', 'Media folders');
    this.sidebar.id = `vg-folders-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const main = el(root, 'main', 'vg-main');
    const header = el(main, 'header', 'vg-header');
    this.sidebarToggle = button(header, 'Toggle folder pane', 'panel-left', () => {
      const previous = this.plugin.data.sidebarCollapsed;
      this.plugin.data.sidebarCollapsed = !previous;
      this.plugin.applyViewSettings();
      void this.plugin.persist().catch(error => {
        this.plugin.data.sidebarCollapsed = previous;
        this.plugin.applyViewSettings();
        this.plugin.reportSaveError(error);
      });
    }, 'vg-icon-button vg-sidebar-toggle');
    this.sidebarToggle.setAttribute('aria-controls', this.sidebar.id);
    const heading = el(header, 'div', 'vg-header-heading');
    el(heading, 'div', 'vg-eyebrow', 'YOUR VAULT, IN VIEW');
    el(heading, 'h1', '', 'Media library');
    const actions = el(header, 'div', 'vg-header-actions');
    this.counter = el(actions, 'span', 'vg-counter');
    this.counter.setAttribute('role', 'status');
    const picker = el(actions, 'input');
    picker.type = 'file'; picker.multiple = true; picker.accept = mediaAccept(); picker.hidden = true;
    picker.setAttribute('aria-label', 'Choose media files');
    const importButton = button(actions, 'Add media', null, () => picker.click(), 'mod-cta vg-add-media');
    const importStatus = el(actions, 'span', 'vg-import-status');
    importStatus.setAttribute('role', 'status');
    picker.addEventListener('change', () => {
      const files = Array.from(picker.files || []);
      picker.value = '';
      if (!files.length) return;
      importButton.disabled = true;
      void this.plugin.importMedia(files, message => { importStatus.textContent = message; }).then(result => {
        const message = `${result.paths.length} imported${result.failed.length ? `, ${result.failed.length} failed` : ''}.`;
        importStatus.textContent = message;
        if (result.paths.length) {
          this.filters.query = ''; this.filters.kind = 'all'; this.filters.tag = ''; this.filters.collection = null;
          this.filters.folder = result.paths[0].includes('/') ? result.paths[0].slice(0, result.paths[0].lastIndexOf('/')) : '';
          this.search.value = ''; this.refresh();
          this.select(result.paths[0]);
        }
        new Notice(result.failed.length ? `${message} Could not import: ${result.failed.join(', ')}` : message);
      }).catch(error => {
        importStatus.textContent = 'Import failed.';
        console.error(error); new Notice('Could not import media. Check the destination folder.');
      }).finally(() => { importButton.disabled = false; });
    });
    button(actions, 'Gallery settings', 'settings', () => new GallerySettingsModal(this.app, this.plugin).open(), 'vg-icon-button');
    button(actions, 'Refresh library', 'refresh-cw', () => this.refresh(), 'vg-icon-button');
    const tabBar = el(main, 'nav', 'vg-tabs');
    tabBar.setAttribute('aria-label', 'Media types');
    for (const kind of KINDS) {
      const tab = button(tabBar, kind.label, null, () => {
        this.filters.kind = kind.value;
        this.applyFilters();
      }, 'vg-tab');
      tab.replaceChildren();
      setIcon(el(tab, 'span', 'vg-icon'), kind.icon);
      el(tab, 'span', '', kind.label);
      this.tabs.set(kind.value, tab);
    }
    const toolbar = el(main, 'div', 'vg-toolbar');
    const searchWrap = el(toolbar, 'div', 'vg-search');
    setIcon(el(searchWrap, 'span', 'vg-icon'), 'search');
    this.search = el(searchWrap, 'input');
    this.search.type = 'search';
    this.search.placeholder = 'Search names, tags, descriptions…';
    this.search.setAttribute('aria-label', 'Search media');
    this.search.addEventListener('input', () => {
      this.filters.query = this.search.value;
      this.applyFilters();
    });
    this.tagSelect = el(toolbar, 'select', 'vg-select');
    this.tagSelect.setAttribute('aria-label', 'Filter by tag');
    this.tagSelect.addEventListener('change', () => {
      this.filters.tag = this.tagSelect.value;
      this.applyFilters();
    });
    const sort = el(toolbar, 'select', 'vg-select');
    sort.setAttribute('aria-label', 'Sort media');
    for (const [value, label] of [['newest', 'Recently modified'], ['oldest', 'Oldest modified'], ['name', 'Name A–Z'], ['largest', 'Largest first']]) {
      const option = el(sort, 'option', '', label);
      option.value = value;
    }
    sort.addEventListener('change', () => {
      this.filters.sort = sort.value as SortOrder;
      this.applyFilters();
    });
    const sizing = el(toolbar, 'label', 'vg-sizing');
    setIcon(el(sizing, 'span', 'vg-icon'), 'grid-2x2');
    const slider = el(sizing, 'input');
    this.thumbnailSlider = slider;
    slider.type = 'range'; slider.min = '140'; slider.max = '360'; slider.step = '10';
    slider.value = String(this.plugin.data.thumbnailSize);
    slider.setAttribute('aria-label', 'Thumbnail size');
    slider.addEventListener('input', () => {
      this.plugin.data.thumbnailSize = Number(slider.value);
      this.setThumbnailSize();
    });
    slider.addEventListener('change', () => {
      void this.plugin.persist().catch(error => this.plugin.reportSaveError(error));
    });
    const scroll = el(main, 'div', 'vg-scroll');
    const sectionHeading = el(scroll, 'div', 'vg-section-heading');
    this.folderTitle = el(sectionHeading, 'h2', '', 'All media');
    button(sectionHeading, 'Clear filters', null, () => {
      this.filters = { query: '', kind: 'all', folder: null, tag: '', sort: 'newest' };
      this.search.value = '';
      sort.value = 'newest';
      this.refresh();
    }, 'vg-text-button');
    button(sectionHeading, 'Select all', null, () => { this.selectedPaths = new Set(this.filtered.map(file => file.path)); this.syncSelection(); }, 'vg-text-button');
    this.selectionBar = el(scroll, 'div', 'vg-selection-bar');
    this.selectionBar.setAttribute('aria-label', 'Selected file actions');
    this.selectionBar.hidden = true;
    this.preview = el(scroll, 'section', 'vg-preview');
    this.preview.hidden = true;
    this.preview.setAttribute('aria-label', 'Selected media');
    this.grid = el(scroll, 'div', 'vg-grid');
    this.grid.setAttribute('aria-label', 'Media files');
    this.applySettings();
    this.registerDomEvent(root, 'keydown', event => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable="true"], video, audio')) return;
      if (event.key === 'Escape') { this.select(null); event.preventDefault(); }
      if (this.selectedPath && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        this.navigate(event.key === 'ArrowLeft' ? -1 : 1); event.preventDefault();
      }
    });
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.observer?.disconnect();
    stopMedia(this.contentEl);
    this.contentEl.replaceChildren();
  }

  onPathMoved(oldPath: string, newPath: string): void {
    const moved = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
    this.selectedPaths = new Set([...this.selectedPaths].map(moved));
    if (this.selectionAnchor) this.selectionAnchor = moved(this.selectionAnchor);
    if (this.selectedPath === oldPath || this.selectedPath?.startsWith(`${oldPath}/`)) {
      this.selectedPath = newPath + this.selectedPath.slice(oldPath.length);
    }
    const folder = this.filters.folder;
    if (folder === oldPath || folder?.startsWith(`${oldPath}/`)) this.filters.folder = newPath + folder.slice(oldPath.length);
    // Close a stale URL after a rename; the user can select the moved file again.
    if (!this.renaming) this.select(null);
  }

  refresh(): void {
    if (!this.grid) return;
    this.files = this.app.vault.getFiles().filter(file => mediaKind(file.extension));
    if (this.filters.collection && !this.plugin.data.collections.some(item => item.id === this.filters.collection)) this.filters.collection = null;
    this.renderTagOptions();
    this.renderFolders();
    this.applyFilters();
  }

  applySettings(): void {
    if (!this.sidebar) return;
    this.sidebar.hidden = this.plugin.data.sidebarCollapsed;
    this.sidebarToggle.setAttribute('aria-expanded', String(!this.plugin.data.sidebarCollapsed));
    this.sidebarToggle.title = this.plugin.data.sidebarCollapsed ? 'Show folder pane' : 'Hide folder pane';
    if (this.thumbnailSlider) this.thumbnailSlider.value = String(this.plugin.data.thumbnailSize);
    this.setThumbnailSize();
  }

  private setThumbnailSize(): void {
    this.contentEl.setCssProps({ '--vg-card-size': `${this.plugin.data.thumbnailSize}px` });
  }

  private renderTagOptions(): void {
    const tags = [...new Set(this.files.flatMap(file => getMetadata(this.plugin.data, file.path).tags))].sort();
    if (this.filters.tag && !tags.includes(this.filters.tag)) this.filters.tag = '';
    this.tagSelect.replaceChildren();
    const all = el(this.tagSelect, 'option', '', 'All tags'); all.value = '';
    for (const tag of tags) { const option = el(this.tagSelect, 'option', '', `#${tag}`); option.value = tag; }
    this.tagSelect.value = this.filters.tag;
  }

  private renderFolders(): void {
    this.sidebar.replaceChildren();
    const brand = el(this.sidebar, 'div', 'vg-brand');
    setIcon(el(brand, 'span', 'vg-brand-icon'), 'images');
    el(brand, 'strong', '', 'Media Hub');
    el(this.sidebar, 'div', 'vg-sidebar-label', 'LIBRARY');
    const folderButton = (label: string, path: string | null, count: number, depth: number) => {
      const row = button(this.sidebar, label, null, () => {
        this.filters.folder = path; this.filters.collection = null; this.renderFolders(); this.applyFilters();
      }, 'vg-folder');
      row.setCssProps({ '--vg-depth': String(Math.min(depth, 5)) });
      row.title = path === null ? 'All media in the vault' : path || 'Vault root';
      row.setAttribute('aria-pressed', String(!this.filters.collection && this.filters.folder === path));
      row.replaceChildren();
      setIcon(el(row, 'span', 'vg-icon'), path === null ? 'library' : 'folder');
      el(row, 'span', 'vg-folder-name', label);
      el(row, 'span', 'vg-folder-count', String(count));
    };
    folderButton('All media', null, this.files.length, 0);
    const collectionsHeader = el(this.sidebar, 'div', 'vg-collections-header');
    el(collectionsHeader, 'span', 'vg-sidebar-label', 'COLLECTIONS');
    button(collectionsHeader, 'New collection', 'plus', () => this.openCollectionDialog([]), 'vg-icon-button');
    const knownPaths = new Set(this.files.map(file => file.path));
    for (const collection of [...this.plugin.data.collections].sort((a, b) => a.name.localeCompare(b.name))) {
      const row = button(this.sidebar, `Collection ${collection.name}`, null, () => {
        this.filters.collection = collection.id; this.filters.folder = null; this.renderFolders(); this.applyFilters();
      }, 'vg-folder');
      row.setAttribute('aria-pressed', String(this.filters.collection === collection.id));
      row.replaceChildren(); setIcon(el(row, 'span', 'vg-icon'), 'album');
      el(row, 'span', 'vg-folder-name', collection.name);
      el(row, 'span', 'vg-folder-count', String(collection.paths.filter(path => knownPaths.has(path)).length));
    }
    el(this.sidebar, 'div', 'vg-sidebar-label vg-folder-label', 'FOLDERS');
    const counts = new Map<string, number>();
    for (const file of this.files) {
      const parts = file.path.split('/'); parts.pop();
      if (parts.length === 0) counts.set('', (counts.get('') ?? 0) + 1);
      for (let index = 1; index <= parts.length; index++) {
        const path = parts.slice(0, index).join('/');
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    if (this.filters.folder !== null && !counts.has(this.filters.folder)) this.filters.folder = null;
    for (const [path, count] of [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
      const parts = path.split('/');
      folderButton(path ? parts[parts.length - 1] : 'Vault root', path, count, path ? parts.length - 1 : 0);
    }
    const footer = el(this.sidebar, 'div', 'vg-sidebar-footer');
    setIcon(el(footer, 'span', 'vg-icon'), 'hard-drive');
    el(footer, 'span', '', 'Local files. Your vault.');
  }

  private applyFilters(): void {
    this.filtered = filterMedia(this.files, this.plugin.data, this.filters);
    this.visibleCount = PAGE_SIZE;
    for (const [kind, tab] of this.tabs) tab.setAttribute('aria-pressed', String(this.filters.kind === kind));
    this.tagSelect.value = this.filters.tag;
    const collection = this.plugin.data.collections.find(item => item.id === this.filters.collection);
    this.folderTitle.textContent = collection ? collection.name : this.filters.folder === null ? 'All media' : this.filters.folder || 'Vault root';
    const visible = new Set(this.filtered.map(file => file.path));
    this.selectedPaths = new Set([...this.selectedPaths].filter(path => visible.has(path)));
    if (this.selectionAnchor && !visible.has(this.selectionAnchor)) this.selectionAnchor = null;
    this.counter.textContent = `${this.filtered.length} / ${this.files.length} files`;
    if (this.selectedPath && !this.filtered.some(file => file.path === this.selectedPath)) this.select(null);
    if (this.selectedPath) {
      const index = this.filtered.findIndex(file => file.path === this.selectedPath);
      const previous = this.preview.querySelector<HTMLButtonElement>('[aria-label="Previous media"]');
      const next = this.preview.querySelector<HTMLButtonElement>('[aria-label="Next media"]');
      const position = this.preview.querySelector('.vg-position');
      if (previous) previous.disabled = index <= 0;
      if (next) next.disabled = index >= this.filtered.length - 1;
      if (position) position.textContent = `${index + 1} of ${this.filtered.length}`;
    }
    this.renderGrid();
    this.syncSelection();
  }

  private renderGrid(): void {
    this.observer?.disconnect();
    this.grid.replaceChildren();
    if (this.filtered.length === 0) {
      const empty = el(this.grid, 'div', 'vg-empty');
      setIcon(el(empty, 'div', 'vg-empty-icon'), this.files.length ? 'search-x' : 'images');
      el(empty, 'h3', '', this.filters.collection ? 'No matching media in this collection' : this.files.length ? 'No matching media' : 'A home for your media');
      el(empty, 'p', '', this.filters.collection ? 'Select files in All media and use Add to collection, or clear your filters.' : this.files.length ? 'Try another folder, media type, tag, or search.' : 'Add images, GIFs, videos, audio, or PDFs to your vault. They will appear here automatically.');
      return;
    }
    this.appendPage();
  }

  private appendPage(): void {
    this.grid.querySelector('.vg-load-more')?.remove();
    const start = this.grid.querySelectorAll('.vg-card').length;
    for (const file of this.filtered.slice(start, this.visibleCount)) this.renderCard(file);
    this.syncSelection();
    if (this.visibleCount < this.filtered.length) {
      const more = button(this.grid, `Load more (${this.filtered.length - this.visibleCount} remaining)`, null, () => {
        this.observer?.disconnect();
        this.visibleCount += PAGE_SIZE; this.appendPage();
      }, 'vg-load-more');
      const Observer = this.contentEl.ownerDocument.defaultView?.IntersectionObserver;
      if (Observer) {
        this.observer = new Observer(entries => {
          if (entries.some(entry => entry.isIntersecting)) more.click();
        }, { root: this.grid.parentElement, rootMargin: '250px' });
        this.observer.observe(more);
      }
    }
  }

  private renderCard(file: TFile): void {
    const kind = mediaKind(file.extension)!;
    const card = el(this.grid, 'div', 'vg-card');
    card.dataset.path = file.path;
    card.dataset.previewed = String(file.path === this.selectedPath);
    const open = button(card, `Preview ${file.name}`, null, () => this.select(file.path), 'vg-card-open');
    open.textContent = '';
    open.dataset.path = file.path;
    open.setAttribute('aria-pressed', String(file.path === this.selectedPath));
    const checkbox = el(card, 'input', 'vg-select-checkbox');
    checkbox.type = 'checkbox'; checkbox.checked = this.selectedPaths.has(file.path);
    checkbox.setAttribute('aria-label', `Select ${file.name}`);
    checkbox.addEventListener('click', event => {
      const index = this.filtered.findIndex(item => item.path === file.path);
      const anchor = this.filtered.findIndex(item => item.path === this.selectionAnchor);
      const paths = event.shiftKey && anchor >= 0 ? this.filtered.slice(Math.min(index, anchor), Math.max(index, anchor) + 1).map(item => item.path) : [file.path];
      for (const path of paths) { if (checkbox.checked) this.selectedPaths.add(path); else this.selectedPaths.delete(path); }
      this.selectionAnchor = file.path; this.syncSelection();
    });
    const thumb = el(open, 'div', 'vg-thumb');
    if (kind === 'image' || kind === 'gif') {
      const image = el(thumb, 'img');
      image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.src = this.app.vault.getResourcePath(file);
      image.addEventListener('error', () => {
        image.remove();
        setIcon(el(thumb, 'span', 'vg-file-icon'), 'image-off');
        el(thumb, 'span', 'vg-no-preview', 'Preview unavailable');
      }, { once: true });
    } else {
      thumb.classList.add(`vg-thumb-${kind}`);
      setIcon(el(thumb, 'span', 'vg-file-icon'), KINDS.find(item => item.value === kind)!.icon);
      el(thumb, 'span', 'vg-no-preview', kind === 'video' ? 'Select to play' : kind === 'audio' ? 'Select to listen' : 'PDF document');
    }
    el(thumb, 'span', 'vg-badge', file.extension.toUpperCase());
    const info = el(open, 'div', 'vg-card-info');
    el(info, 'div', 'vg-card-name', file.name);
    const meta = getMetadata(this.plugin.data, file.path);
    el(info, 'div', 'vg-card-subtitle', meta.tags.length ? meta.tags.map(tag => `#${tag}`).join('  ') : `${formatSize(file.stat.size)} · ${file.parent?.path === '/' ? 'Vault root' : file.parent?.path || 'Vault root'}`);
  }

  private select(path: string | null): void {
    stopMedia(this.preview);
    this.selectedPath = path;
    this.tagEditor = null;
    this.previewImage = null; this.zoom = 1;
    this.preview.replaceChildren();
    this.preview.hidden = path === null;
    for (const card of Array.from(this.grid.querySelectorAll<HTMLButtonElement>('.vg-card-open'))) {
      card.setAttribute('aria-pressed', String(card.dataset.path === path));
      const wrapper = card.closest<HTMLElement>('.vg-card');
      if (wrapper) wrapper.dataset.previewed = String(card.dataset.path === path);
    }
    if (!path) return;
    const file = this.files.find(item => item.path === path);
    if (!file) { this.selectedPath = null; this.preview.hidden = true; return; }
    const stage = el(this.preview, 'div', 'vg-stage');
    const tools = el(stage, 'div', 'vg-preview-tools');
    const index = this.filtered.indexOf(file);
    const prev = button(tools, 'Previous media', 'chevron-left', () => this.navigate(-1), 'vg-icon-button');
    prev.disabled = index <= 0;
    const next = button(tools, 'Next media', 'chevron-right', () => this.navigate(1), 'vg-icon-button');
    next.disabled = index >= this.filtered.length - 1;
    el(tools, 'span', 'vg-position', `${index + 1} of ${this.filtered.length}`);
    const kind = mediaKind(file.extension);
    if (kind === 'image' || kind === 'gif') {
      button(tools, 'Zoom out', 'minus', () => this.setZoom(this.zoom - 0.25), 'vg-icon-button');
      button(tools, 'Reset zoom', 'maximize', () => this.setZoom(1), 'vg-icon-button');
      button(tools, 'Zoom in', 'plus', () => this.setZoom(this.zoom + 0.25), 'vg-icon-button');
    }
    button(tools, 'Close preview', 'x', () => {
      this.select(null);
      const card = Array.from(this.grid.querySelectorAll<HTMLButtonElement>('.vg-card-open')).find(item => item.dataset.path === path);
      (card || this.contentEl).focus();
    }, 'vg-icon-button vg-close');
    const viewport = el(stage, 'div', 'vg-viewport');
    if (kind === 'image' || kind === 'gif') {
      viewport.classList.add('vg-image-viewport');
      this.previewImage = el(viewport, 'img', 'vg-preview-image');
      this.previewImage.alt = file.name;
      this.previewImage.src = this.app.vault.getResourcePath(file);
      this.previewImage.addEventListener('load', () => {
        dimensions.textContent = `${this.previewImage?.naturalWidth} × ${this.previewImage?.naturalHeight} px`;
      });
      this.previewImage.addEventListener('error', () => {
        viewport.replaceChildren(); viewport.classList.remove('vg-image-viewport'); this.previewImage = null;
        this.renderUnavailable(viewport, 'This image format cannot be previewed on this device.');
      }, { once: true });
    } else if (kind === 'video' || kind === 'audio') {
      if (kind === 'audio') setIcon(el(viewport, 'div', 'vg-audio-art'), 'music');
      const media = el(viewport, kind, 'vg-player');
      media.controls = true; media.preload = 'metadata';
      if (media instanceof this.contentEl.ownerDocument.defaultView!.HTMLVideoElement) media.playsInline = true;
      media.src = this.app.vault.getResourcePath(file);
      media.addEventListener('loadedmetadata', () => {
        const duration = Number.isFinite(media.duration) ? `${Math.floor(media.duration / 60)}:${String(Math.floor(media.duration % 60)).padStart(2, '0')}` : 'Unknown duration';
        dimensions.textContent = duration;
      });
      media.addEventListener('error', () => {
        viewport.replaceChildren();
        this.renderUnavailable(viewport, 'This media format or codec cannot be played on this device.');
      }, { once: true });
    } else {
      setIcon(el(viewport, 'div', 'vg-audio-art'), 'file-text');
      el(viewport, 'p', 'vg-preview-message', 'Open this PDF in Obsidian to read it.');
      button(viewport, 'Open PDF', null, () => { void this.openFile(file); }, 'mod-cta');
    }
    const inspector = el(this.preview, 'aside', 'vg-inspector');
    el(inspector, 'div', 'vg-eyebrow', 'FILE DETAILS');
    const nameLabel = el(inspector, 'label', 'vg-field vg-filename-label');
    el(nameLabel, 'span', '', 'File name');
    const nameRow = el(nameLabel, 'span', 'vg-filename-row');
    const nameInput = el(nameRow, 'input', 'vg-filename');
    nameInput.type = 'text';
    nameInput.value = file.name.slice(0, -(file.extension.length + 1));
    nameInput.setAttribute('aria-label', 'File name');
    el(nameRow, 'span', 'vg-extension', `.${file.extension}`);
    const renameStatus = el(inspector, 'p', 'vg-hint vg-rename-status');
    renameStatus.setAttribute('role', 'status');
    const rename = button(inspector, 'Rename file', null, () => { void renameFile(); }, 'vg-rename');
    nameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); rename.click(); }
    });
    el(inspector, 'div', 'vg-detail-path', file.path);
    const details = el(inspector, 'dl', 'vg-details');
    const row = (label: string, value: string) => { el(details, 'dt', '', label); return el(details, 'dd', '', value); };
    row('Format', file.extension.toUpperCase()); row('Size', formatSize(file.stat.size));
    const dimensions = row(kind === 'audio' || kind === 'video' ? 'Duration' : 'Dimensions', '—');
    if (kind === 'pdf') { dimensions.previousElementSibling?.remove(); dimensions.remove(); }
    row('Created', new Date(file.stat.ctime).toLocaleDateString());
    row('Modified', new Date(file.stat.mtime).toLocaleDateString());
    const metadata = getMetadata(this.plugin.data, file.path);
    const tagLabel = el(inspector, 'div', 'vg-field');
    el(tagLabel, 'span', '', 'Tags');
    let markDirty = () => {};
    const tags = new TagEditor(tagLabel, metadata.tags, () => this.knownTags(), () => markDirty());
    this.tagEditor = tags;
    el(inspector, 'p', 'vg-hint', 'Press Enter or comma to add a tag.');
    const descriptionLabel = el(inspector, 'label', 'vg-field');
    el(descriptionLabel, 'span', '', 'Description');
    const description = el(descriptionLabel, 'textarea');
    description.rows = 3; description.value = metadata.description; description.placeholder = 'Add a little context…';
    const save = button(inspector, 'Save details', null, () => {
      const old = getMetadata(this.plugin.data, file.path);
      this.plugin.data.metadata[file.path] = { tags: tags.getTags(), description: description.value.trim() };
      save.disabled = true; rename.disabled = true; tags.setDisabled(true); description.disabled = true; save.textContent = 'Saving…';
      void this.plugin.persist().then(() => {
        save.disabled = false; rename.disabled = false; tags.setDisabled(false); description.disabled = false; save.textContent = 'Saved';
        tags.setTags(getMetadata(this.plugin.data, file.path).tags);
        this.plugin.refreshViews();
      }).catch(error => {
        this.plugin.data.metadata[file.path] = old;
        save.disabled = false; rename.disabled = false; tags.setDisabled(false); description.disabled = false; save.textContent = 'Retry save';
        this.plugin.reportSaveError(error);
      });
    }, 'mod-cta vg-save');
    const renameFile = async () => {
      renameStatus.textContent = '';
      let newPath: string;
      try {
        newPath = renamedPath(file, nameInput.value);
        if (newPath === file.path) { renameStatus.textContent = 'The name is unchanged.'; return; }
        if (this.app.vault.getAbstractFileByPath(newPath)) throw new Error('A file with this name already exists in this folder.');
      } catch (error) {
        renameStatus.textContent = error instanceof Error ? error.message : 'Invalid file name.';
        nameInput.focus();
        return;
      }
      const draftTags = tags.getTags();
      const draftDescription = description.value;
      rename.disabled = true; save.disabled = true; nameInput.disabled = true;
      tags.setDisabled(true); description.disabled = true;
      rename.textContent = 'Renaming…';
      this.renaming = true;
      try {
        await this.app.fileManager.renameFile(file, newPath);
        // Vault's rename event migrates tags and notifies other gallery views.
        this.refresh();
        if (this.filtered.some(item => item.path === newPath)) {
          this.select(newPath);
          const newDescription = this.preview.querySelector<HTMLTextAreaElement>('textarea');
          this.tagEditor?.setTags(draftTags);
          if (newDescription) newDescription.value = draftDescription;
        }
        new Notice('File renamed.');
      } catch (error) {
        console.error('Media Hub rename failed', error);
        renameStatus.textContent = error instanceof Error ? error.message : 'Could not rename this file.';
        rename.disabled = false; save.disabled = false; nameInput.disabled = false;
        tags.setDisabled(false); description.disabled = false;
        rename.textContent = 'Rename file';
      } finally { this.renaming = false; }
    };
    markDirty = () => { save.textContent = 'Save details'; };
    description.addEventListener('input', markDirty);
    button(inspector, 'Open in Obsidian', 'external-link', () => { void this.openFile(file); }, 'vg-open-file');
    this.preview.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  private knownTags(): string[] {
    return [...new Set(this.files.flatMap(file => getMetadata(this.plugin.data, file.path).tags))];
  }

  private syncSelection(): void {
    if (!this.selectionBar) return;
    for (const card of Array.from(this.grid.querySelectorAll<HTMLElement>('.vg-card'))) {
      const selected = this.selectedPaths.has(card.dataset.path || '');
      card.dataset.selected = String(selected);
      const checkbox = card.querySelector<HTMLInputElement>('.vg-select-checkbox');
      if (checkbox) checkbox.checked = selected;
    }
    this.selectionBar.replaceChildren();
    this.selectionBar.hidden = !this.selectedPaths.size;
    if (!this.selectedPaths.size) return;
    const paths = [...this.selectedPaths];
    const count = el(this.selectionBar, 'strong', '', `${paths.length} selected`);
    count.setAttribute('role', 'status');
    button(this.selectionBar, 'Clear selection', null, () => {
      this.selectedPaths.clear(); this.selectionAnchor = null; this.syncSelection();
    }, 'vg-text-button');
    button(this.selectionBar, 'Add tags', null, () => this.openTagsDialog(paths));
    button(this.selectionBar, 'Add to collection', null, () => this.openCollectionDialog(paths));
    if (this.filters.collection) {
      const collectionId = this.filters.collection;
      const remove = button(this.selectionBar, 'Remove from collection', null, () => {
        remove.disabled = true;
        void this.plugin.mutateData(data => {
          const collection = data.collections.find(item => item.id === collectionId);
          if (!collection) throw new Error('The collection no longer exists.');
          const selected = new Set(paths);
          collection.paths = collection.paths.filter(path => !selected.has(path));
        }).catch(error => { remove.disabled = false; this.plugin.reportSaveError(error); });
      });
    }
    button(this.selectionBar, 'Delete files', null, () => this.openDeleteDialog(paths), 'vg-delete-button');
  }

  private openTagsDialog(paths: readonly string[]): void {
    new GalleryActionModal(this.app, `Add tags to ${paths.length} files`, (body, close) => {
      el(body, 'p', 'vg-setting-hint', 'These tags will be added to every selected file. Existing tags and descriptions are preserved.');
      const editor = new TagEditor(body, [], () => this.knownTags(), undefined, 'Tags to add');
      const status = el(body, 'p', 'vg-setting-hint'); status.setAttribute('role', 'status');
      const actions = el(body, 'div', 'vg-modal-actions');
      const cancel = button(actions, 'Cancel', null, close);
      const apply = button(actions, 'Apply tags', null, () => {
        const tags = editor.getTags();
        if (!tags.length) { status.textContent = 'Add at least one tag.'; return; }
        apply.disabled = true; cancel.disabled = true; editor.setDisabled(true);
        void this.plugin.mutateData(data => {
          const available = new Set(this.app.vault.getFiles().map(file => file.path));
          for (const path of paths) {
            if (!available.has(path)) continue;
            const previous = getMetadata(data, path);
            data.metadata[path] = { tags: parseTags([...previous.tags, ...tags].join(',')), description: previous.description };
          }
        }).then(() => {
          if (this.selectedPath && paths.includes(this.selectedPath)) this.tagEditor?.addTags(tags);
          close();
        }).catch(error => {
          status.textContent = 'Could not save tags. Try again.';
          apply.disabled = false; cancel.disabled = false; editor.setDisabled(false);
          this.plugin.reportSaveError(error);
        });
      }, 'mod-cta');
    }).open();
  }

  private openCollectionDialog(paths: readonly string[]): void {
    new GalleryActionModal(this.app, paths.length ? `Add ${paths.length} files to a collection` : 'Create collection', (body, close) => {
      el(body, 'p', 'vg-setting-hint', 'Collections group files without moving or copying them. A file can belong to several collections.');
      let existing: HTMLSelectElement | null = null;
      if (paths.length) {
        const label = el(body, 'label', 'vg-setting-field'); el(label, 'span', '', 'Collection');
        existing = el(label, 'select'); existing.setAttribute('aria-label', 'Choose collection');
        const option = el(existing, 'option', '', 'Create a new collection'); option.value = '';
        for (const collection of [...this.plugin.data.collections].sort((a, b) => a.name.localeCompare(b.name))) {
          const option = el(existing, 'option', '', collection.name); option.value = collection.id;
        }
      }
      const label = el(body, 'label', 'vg-setting-field'); el(label, 'span', '', 'New collection name');
      const name = el(label, 'input'); name.type = 'text'; name.placeholder = 'Travel'; name.setAttribute('aria-label', 'New collection name');
      existing?.addEventListener('change', () => { name.disabled = Boolean(existing?.value); });
      const status = el(body, 'p', 'vg-setting-hint'); status.setAttribute('role', 'status');
      const actions = el(body, 'div', 'vg-modal-actions');
      const cancel = button(actions, 'Cancel', null, close);
      const submit = button(actions, paths.length ? 'Add to collection' : 'Create collection', null, () => {
        const existingId = existing?.value || '';
        const newName = name.value.trim();
        if (!existingId && !newName) { status.textContent = 'Enter a collection name.'; return; }
        let targetId = existingId;
        submit.disabled = true; cancel.disabled = true; name.disabled = true;
        if (existing) existing.disabled = true;
        void this.plugin.mutateData(data => {
          const available = new Set(this.app.vault.getFiles().map(file => file.path));
          const members = paths.filter(path => available.has(path));
          if (paths.length && !members.length) throw new Error('The selected files are no longer available.');
          if (existingId) {
            const collection = data.collections.find(item => item.id === existingId);
            if (!collection) throw new Error('The collection no longer exists.');
            collection.paths = [...new Set([...collection.paths, ...members])];
          } else targetId = createCollection(data, newName, members).id;
        }).then(() => {
          if (!paths.length) { this.filters.collection = targetId; this.filters.folder = null; this.refresh(); }
          close();
        }).catch(error => {
          status.textContent = error instanceof Error ? error.message : 'Could not save collection.';
          submit.disabled = false; cancel.disabled = false; name.disabled = Boolean(existingId);
          if (existing) existing.disabled = false;
        });
      }, 'mod-cta');
      name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit.click(); } });
    }).open();
  }

  private openDeleteDialog(paths: readonly string[]): void {
    const files = this.app.vault.getFiles();
    const targets = paths.flatMap(path => {
      const file = files.find(item => item.path === path);
      return file && mediaKind(file.extension) ? [{ file, path }] : [];
    });
    if (!targets.length) return;
    const noun = targets.length === 1 ? 'file' : 'files';
    new GalleryActionModal(this.app, `Delete ${targets.length} ${noun} from the vault?`, (body, close) => {
      el(body, 'p', 'vg-setting-hint', `The following ${targets.length} ${noun} will be removed from the vault and all collections, using your configured trash location. Removing files from a collection alone does not delete them.`);
      const list = el(body, 'ul', 'vg-delete-list');
      for (const target of targets) el(list, 'li', '', target.path);
      const status = el(body, 'p', 'vg-setting-hint'); status.setAttribute('role', 'status');
      const actions = el(body, 'div', 'vg-modal-actions');
      const cancel = button(actions, 'Cancel', null, close);
      const confirm = button(actions, `Move ${targets.length} ${noun} to trash`, null, () => {
        confirm.disabled = true; cancel.disabled = true; status.textContent = 'Moving files to trash…';
        void this.plugin.trashMedia(targets).then(result => {
          for (const path of result.deleted) this.selectedPaths.delete(path);
          this.syncSelection();
          if (result.failed.length) {
            status.textContent = `${result.deleted.length} moved to trash. Could not delete ${result.failed.length} files; they may have changed or be unwritable.`;
            confirm.hidden = true; cancel.disabled = false; cancel.textContent = 'Close';
          } else close();
        }).catch(error => {
          console.error(error); status.textContent = 'Could not complete deletion. Check the files before trying again.';
          confirm.disabled = false; cancel.disabled = false;
        });
      }, 'mod-warning');
    }).open();
  }

  private renderUnavailable(parent: HTMLElement, message: string): void {
    setIcon(el(parent, 'div', 'vg-audio-art'), 'file-question');
    el(parent, 'p', 'vg-preview-message', message);
    el(parent, 'p', 'vg-hint', 'Use “Open in Obsidian” or open the file in your system’s media app.');
  }
  private async openFile(file: TFile): Promise<void> {
    try { await this.app.workspace.getLeaf('tab').openFile(file); }
    catch (error) { console.error(error); new Notice('Could not open this file in Obsidian.'); }
  }
  private setZoom(zoom: number): void {
    this.zoom = Math.min(4, Math.max(0.5, zoom));
    if (this.previewImage) {
      this.previewImage.setCssProps({ '--vg-preview-width': `${this.zoom * 100}%` });
      this.previewImage.classList.toggle('vg-image-zoomed', this.zoom !== 1);
    }
  }
  private navigate(direction: number): void {
    const index = this.filtered.findIndex(file => file.path === this.selectedPath);
    const file = this.filtered[index + direction];
    if (file) this.select(file.path);
  }
}
