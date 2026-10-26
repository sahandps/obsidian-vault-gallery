import { ItemView, Notice, Plugin, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import {
  filterMedia, formatSize, getMetadata, mediaKind, moveMetadata, parseTags,
  removeMetadata, renamedPath, sanitizeData, type Filters, type GalleryData, type MediaKind, type SortOrder,
} from './model';

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
  const node = parent.ownerDocument.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
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

export default class VaultGalleryPlugin extends Plugin {
  data: GalleryData = sanitizeData(null);
  private saveQueue: Promise<void> = Promise.resolve();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  async onload(): Promise<void> {
    try { this.data = sanitizeData(await this.loadData()); }
    catch (error) {
      console.error('Vault Gallery could not load its data', error);
      new Notice('Vault Gallery could not load saved tags. Reload the plugin before editing tags.');
      // Do not overwrite an unreadable metadata file with defaults.
      return;
    }
    this.registerView(VIEW_TYPE, leaf => new GalleryView(leaf, this));
    this.addRibbonIcon('images', 'Open vault gallery', () => { void this.activate(); });
    this.addCommand({ id: 'open-gallery', name: 'Open gallery', callback: () => { void this.activate(); } });
    this.registerEvent(this.app.vault.on('create', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('modify', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      moveMetadata(this.data, oldPath, file.path);
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

  onunload(): void { if (this.refreshTimer) clearTimeout(this.refreshTimer); }

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
      new Notice('Could not open Vault Gallery. See the developer console for details.');
    }
  }
  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshViews(), 180);
  }
  refreshViews(): void { for (const view of this.views()) view.refresh(); }
  persist(): Promise<void> {
    // Snapshot every write and serialize them, so a slow older write cannot replace newer tags.
    const snapshot = JSON.parse(JSON.stringify(this.data));
    const write = this.saveQueue.catch(() => undefined).then(() => this.saveData(snapshot));
    this.saveQueue = write;
    return write;
  }
  reportSaveError(error: unknown): void {
    console.error('Vault Gallery save failed', error);
    new Notice('Could not save gallery data. Check that your vault is writable.');
  }
}

export class GalleryView extends ItemView {
  private filters: Filters = { query: '', kind: 'all', folder: null, tag: '', sort: 'newest' };
  private selectedPath: string | null = null;
  private files: TFile[] = [];
  private filtered: TFile[] = [];
  private visibleCount = PAGE_SIZE;
  private observer: IntersectionObserver | null = null;
  private sidebar!: HTMLElement;
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

  constructor(leaf: WorkspaceLeaf, private plugin: VaultGalleryPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Vault Gallery'; }
  getIcon(): string { return 'images'; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.replaceChildren();
    root.classList.add('vg-root');
    root.tabIndex = -1;
    this.sidebar = el(root, 'aside', 'vg-sidebar');
    this.sidebar.setAttribute('aria-label', 'Media folders');
    const main = el(root, 'main', 'vg-main');
    const header = el(main, 'header', 'vg-header');
    const heading = el(header, 'div');
    el(heading, 'div', 'vg-eyebrow', 'YOUR VAULT, IN VIEW');
    el(heading, 'h1', '', 'Media library');
    const actions = el(header, 'div', 'vg-header-actions');
    this.counter = el(actions, 'span', 'vg-counter');
    this.counter.setAttribute('role', 'status');
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
    this.preview = el(scroll, 'section', 'vg-preview');
    this.preview.hidden = true;
    this.preview.setAttribute('aria-label', 'Selected media');
    this.grid = el(scroll, 'div', 'vg-grid');
    this.grid.setAttribute('aria-label', 'Media files');
    this.setThumbnailSize();
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
    this.renderTagOptions();
    this.renderFolders();
    this.applyFilters();
  }

  private setThumbnailSize(): void {
    this.contentEl.style.setProperty('--vg-card-size', `${this.plugin.data.thumbnailSize}px`);
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
    el(brand, 'strong', '', 'Vault Gallery');
    el(this.sidebar, 'div', 'vg-sidebar-label', 'LIBRARY');
    const folderButton = (label: string, path: string | null, count: number, depth: number) => {
      const row = button(this.sidebar, label, null, () => {
        this.filters.folder = path; this.renderFolders(); this.applyFilters();
      }, 'vg-folder');
      row.style.setProperty('--vg-depth', String(Math.min(depth, 5)));
      row.title = path === null ? 'All media in the vault' : path || 'Vault root';
      row.setAttribute('aria-pressed', String(this.filters.folder === path));
      row.replaceChildren();
      setIcon(el(row, 'span', 'vg-icon'), path === null ? 'library' : 'folder');
      el(row, 'span', 'vg-folder-name', label);
      el(row, 'span', 'vg-folder-count', String(count));
    };
    folderButton('All media', null, this.files.length, 0);
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
    this.folderTitle.textContent = this.filters.folder === null ? 'All media' : this.filters.folder || 'Vault root';
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
  }

  private renderGrid(): void {
    this.observer?.disconnect();
    this.grid.replaceChildren();
    if (this.filtered.length === 0) {
      const empty = el(this.grid, 'div', 'vg-empty');
      setIcon(el(empty, 'div', 'vg-empty-icon'), this.files.length ? 'search-x' : 'images');
      el(empty, 'h3', '', this.files.length ? 'No matching media' : 'A home for your media');
      el(empty, 'p', '', this.files.length ? 'Try another folder, media type, tag, or search.' : 'Add images, GIFs, videos, audio, or PDFs to your vault. They will appear here automatically.');
      return;
    }
    this.appendPage();
  }

  private appendPage(): void {
    this.grid.querySelector('.vg-load-more')?.remove();
    const start = this.grid.querySelectorAll('.vg-card').length;
    for (const file of this.filtered.slice(start, this.visibleCount)) this.renderCard(file);
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
    const card = button(this.grid, `Preview ${file.name}`, null, () => this.select(file.path), 'vg-card');
    card.setAttribute('aria-pressed', String(file.path === this.selectedPath));
    card.dataset.path = file.path;
    card.replaceChildren();
    const thumb = el(card, 'div', 'vg-thumb');
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
    const info = el(card, 'div', 'vg-card-info');
    el(info, 'div', 'vg-card-name', file.name);
    const meta = getMetadata(this.plugin.data, file.path);
    el(info, 'div', 'vg-card-subtitle', meta.tags.length ? meta.tags.map(tag => `#${tag}`).join('  ') : `${formatSize(file.stat.size)} · ${file.parent?.path === '/' ? 'Vault root' : file.parent?.path || 'Vault root'}`);
  }

  private select(path: string | null): void {
    stopMedia(this.preview);
    this.selectedPath = path;
    this.previewImage = null; this.zoom = 1;
    this.preview.replaceChildren();
    this.preview.hidden = path === null;
    for (const card of Array.from(this.grid.querySelectorAll<HTMLButtonElement>('.vg-card'))) {
      card.setAttribute('aria-pressed', String(card.dataset.path === path));
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
      const card = Array.from(this.grid.querySelectorAll<HTMLButtonElement>('.vg-card')).find(item => item.dataset.path === path);
      (card || this.contentEl).focus();
    }, 'vg-icon-button vg-close');
    const viewport = el(stage, 'div', 'vg-viewport');
    if (kind === 'image' || kind === 'gif') {
      this.previewImage = el(viewport, 'img', 'vg-preview-image');
      this.previewImage.alt = file.name;
      this.previewImage.src = this.app.vault.getResourcePath(file);
      this.previewImage.addEventListener('load', () => {
        dimensions.textContent = `${this.previewImage?.naturalWidth} × ${this.previewImage?.naturalHeight} px`;
      });
      this.previewImage.addEventListener('error', () => {
        viewport.replaceChildren(); this.previewImage = null;
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
    const tagLabel = el(inspector, 'label', 'vg-field');
    el(tagLabel, 'span', '', 'Tags');
    const tags = el(tagLabel, 'input');
    tags.type = 'text'; tags.value = metadata.tags.join(', '); tags.placeholder = 'travel, inspiration, work';
    el(inspector, 'p', 'vg-hint', 'Separate tags with commas.');
    const descriptionLabel = el(inspector, 'label', 'vg-field');
    el(descriptionLabel, 'span', '', 'Description');
    const description = el(descriptionLabel, 'textarea');
    description.rows = 3; description.value = metadata.description; description.placeholder = 'Add a little context…';
    const save = button(inspector, 'Save details', null, () => {
      const old = getMetadata(this.plugin.data, file.path);
      this.plugin.data.metadata[file.path] = { tags: parseTags(tags.value), description: description.value.trim() };
      save.disabled = true; rename.disabled = true; tags.disabled = true; description.disabled = true; save.textContent = 'Saving…';
      void this.plugin.persist().then(() => {
        save.disabled = false; rename.disabled = false; tags.disabled = false; description.disabled = false; save.textContent = 'Saved';
        this.plugin.refreshViews();
      }).catch(error => {
        this.plugin.data.metadata[file.path] = old;
        save.disabled = false; rename.disabled = false; tags.disabled = false; description.disabled = false; save.textContent = 'Retry save';
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
      const draftTags = tags.value;
      const draftDescription = description.value;
      rename.disabled = true; save.disabled = true; nameInput.disabled = true;
      tags.disabled = true; description.disabled = true;
      rename.textContent = 'Renaming…';
      this.renaming = true;
      try {
        await this.app.fileManager.renameFile(file, newPath);
        // Vault's rename event migrates tags and notifies other gallery views.
        this.refresh();
        if (this.filtered.some(item => item.path === newPath)) {
          this.select(newPath);
          const newTags = this.preview.querySelector<HTMLInputElement>('.vg-field input:not(.vg-filename)');
          const newDescription = this.preview.querySelector<HTMLTextAreaElement>('textarea');
          if (newTags) newTags.value = draftTags;
          if (newDescription) newDescription.value = draftDescription;
        }
        new Notice('File renamed.');
      } catch (error) {
        console.error('Vault Gallery rename failed', error);
        renameStatus.textContent = error instanceof Error ? error.message : 'Could not rename this file.';
        rename.disabled = false; save.disabled = false; nameInput.disabled = false;
        tags.disabled = false; description.disabled = false;
        rename.textContent = 'Rename file';
      } finally { this.renaming = false; }
    };
    const markDirty = () => { save.textContent = 'Save details'; };
    tags.addEventListener('input', markDirty); description.addEventListener('input', markDirty);
    button(inspector, 'Open in Obsidian', 'external-link', () => { void this.openFile(file); }, 'vg-open-file');
    this.preview.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
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
      this.previewImage.style.width = `${this.zoom * 100}%`;
      this.previewImage.style.maxHeight = this.zoom === 1 ? '420px' : 'none';
      this.previewImage.style.maxWidth = 'none';
    }
  }
  private navigate(direction: number): void {
    const index = this.filtered.findIndex(file => file.path === this.selectedPath);
    const file = this.filtered[index + direction];
    if (file) this.select(file.path);
  }
}
