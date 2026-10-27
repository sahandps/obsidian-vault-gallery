// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { ItemView, Notice, type TFile, type WorkspaceLeaf } from 'obsidian';
import { getMetadata } from '../backend/data/metadata';
import { filterMedia, type Filters } from '../backend/media/media-filter';
import { countFilesByFolder } from '../backend/media/folder-counts';
import { mediaKind } from '../backend/media/media-kinds';
import type MediaHubPlugin from '../plugin';
import { openCollectionDialog } from './dialogs/collection-dialog';
import { openDeleteDialog } from './dialogs/delete-dialog';
import { openDownloadDialog } from './dialogs/download-dialog';
import { openTagsDialog } from './dialogs/tags-dialog';
import { el, stopMedia } from './dom';
import { FilterBar } from './panels/filter-bar';
import { FolderSidebar } from './panels/folder-sidebar';
import { GalleryHeader } from './panels/gallery-header';
import { MediaGrid } from './panels/media-grid';
import { PreviewPanel } from './panels/preview/preview-panel';
import { ResultsHeading } from './panels/results-heading';
import { SelectionBar } from './panels/selection-bar';
import { SelectionState } from './selection-state';

export const VIEW_TYPE = 'vault-gallery';

/** The gallery tab. It owns the filters, the current preview and the checked files, and wires the panels together. */
export class GalleryView extends ItemView {
  private filters: Filters = { query: '', kind: 'all', folder: null, tag: '', sort: 'newest' };
  private selection = new SelectionState();
  private selectedPath: string | null = null;
  private files: TFile[] = [];
  private filtered: TFile[] = [];
  private renaming = false;
  private sidebar!: FolderSidebar;
  private header!: GalleryHeader;
  private filterBar!: FilterBar;
  private results!: ResultsHeading;
  private selectionBar!: SelectionBar;
  private preview!: PreviewPanel;
  private grid!: MediaGrid;

  constructor(leaf: WorkspaceLeaf, private plugin: MediaHubPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Media Hub'; }
  getIcon(): string { return 'images'; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.replaceChildren();
    root.classList.add('vg-root');
    root.tabIndex = -1;
    this.sidebar = new FolderSidebar(root, this.sidebarHost());
    const main = el(root, 'main', 'vg-main');
    this.header = new GalleryHeader(main, this.app, this.plugin, {
      sidebarId: this.sidebar.element.id,
      refresh: () => this.refresh(),
      imported: paths => this.showImported(paths),
    });
    this.filterBar = new FilterBar(main, this.plugin, this.filterBarHost());
    const scroll = el(main, 'div', 'vg-scroll');
    this.results = new ResultsHeading(scroll, {
      clearFilters: () => this.clearFilters(),
      toggleSelectAll: () => this.toggleSelectAll(),
    });
    this.selectionBar = new SelectionBar(scroll, this.selectionBarHost());
    this.preview = new PreviewPanel(scroll, this.previewHost());
    this.grid = new MediaGrid(scroll, this.gridHost());
    this.filters.sort = this.plugin.data.defaultSort;
    this.filterBar.setSort(this.filters.sort);
    this.applySettings();
    this.registerDomEvent(root, 'keydown', event => this.handleKey(event));
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.grid?.dispose();
    stopMedia(this.contentEl);
    this.contentEl.replaceChildren();
  }

  /** Called by the plugin when a file or folder was renamed or moved. */
  onPathMoved(oldPath: string, newPath: string): void {
    if (!this.grid) return;
    const inside = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`);
    this.selection.move(oldPath, newPath);
    if (this.selectedPath && inside(this.selectedPath)) this.selectedPath = newPath + this.selectedPath.slice(oldPath.length);
    const folder = this.filters.folder;
    if (folder !== null && inside(folder)) this.filters.folder = newPath + folder.slice(oldPath.length);
    // Close a stale URL after a rename; the user can select the moved file again.
    if (!this.renaming) this.select(null);
  }

  /** Re-reads the vault's media files and redraws everything. */
  refresh(): void {
    if (!this.grid) return;
    this.files = this.app.vault.getFiles().filter(file => mediaKind(file.extension));
    if (this.filters.collection && !this.plugin.data.collections.some(item => item.id === this.filters.collection)) this.filters.collection = null;
    this.renderTagOptions();
    this.renderSidebar();
    this.applyFilters();
  }

  applySettings(): void {
    if (!this.sidebar) return;
    const data = this.plugin.data;
    this.sidebar.element.hidden = data.sidebarCollapsed;
    this.header.applySettings();
    this.filterBar.setThumbnailSize(data.thumbnailSize);
    this.contentEl.dataset.fit = data.thumbnailFit;
    this.contentEl.classList.toggle('vg-compact', data.compact);
    this.contentEl.classList.toggle('vg-hide-filenames', !data.showFilenames);
    this.contentEl.classList.toggle('vg-hide-subtitles', !data.showSubtitles);
    this.setThumbnailSize();
    this.grid.redraw(this.gridContext());
  }

  private setThumbnailSize(): void {
    this.contentEl.setCssProps({ '--vg-card-size': `${this.plugin.data.thumbnailSize}px` });
  }

  private gridContext() { return { totalFiles: this.files.length, inCollection: Boolean(this.filters.collection) }; }

  private knownTags(): string[] {
    return [...new Set(this.files.flatMap(file => getMetadata(this.plugin.data, file.path).tags))];
  }

  private renderTagOptions(): void {
    const tags = this.knownTags().sort();
    if (this.filters.tag && !tags.includes(this.filters.tag)) this.filters.tag = '';
    this.filterBar.setTagOptions(tags, this.filters.tag);
  }

  private renderSidebar(): void {
    if (this.filters.folder !== null && !countFilesByFolder(this.files).has(this.filters.folder)) this.filters.folder = null;
    this.sidebar.render({ files: this.files, folder: this.filters.folder, collection: this.filters.collection });
  }

  private applyFilters(): void {
    this.filtered = filterMedia(this.files, this.plugin.data, this.filters);
    this.filterBar.showFilters(this.filters);
    const collection = this.plugin.data.collections.find(item => item.id === this.filters.collection);
    this.results.setTitle(collection ? collection.name : this.filters.folder === null ? 'All media' : this.filters.folder || 'Vault root');
    this.selection.keepOnly(new Set(this.filtered.map(file => file.path)));
    this.header.setCount(this.filtered.length, this.files.length);
    if (this.selectedPath && !this.filtered.some(file => file.path === this.selectedPath)) this.select(null);
    if (this.selectedPath) this.preview.updatePosition(this.filtered.findIndex(file => file.path === this.selectedPath), this.filtered.length);
    this.grid.render(this.filtered, this.gridContext());
    this.syncSelection();
  }

  private syncSelection(): void {
    if (!this.selectionBar) return;
    this.grid.syncChecked(path => this.selection.has(path));
    const anyFiles = this.filtered.length > 0;
    this.results.setSelectAll(anyFiles && this.selection.size === this.filtered.length, anyFiles);
    this.selectionBar.render(this.selection.toArray(), Boolean(this.filters.collection));
  }

  private select(path: string | null, scrollToPreview = true): void {
    this.selectedPath = path;
    this.grid.markPreviewed(path);
    if (!path) { this.preview.hide(); return; }
    const file = this.files.find(item => item.path === path);
    if (!file) { this.selectedPath = null; this.preview.hide(); return; }
    this.preview.show(file, this.filtered.indexOf(file), this.filtered.length);
    if (scrollToPreview) this.preview.element.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  private navigate(direction: number): void {
    const index = this.filtered.findIndex(file => file.path === this.selectedPath);
    const file = this.filtered[index + direction];
    if (!file) return;
    const navigationFocused = this.contentEl.ownerDocument.activeElement?.closest('.vg-preview-tools');
    this.select(file.path, false);
    if (navigationFocused) this.preview.focusNavigation(direction);
  }

  private handleKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.matches('input:not([type="checkbox"]), textarea, select, [contenteditable="true"], video, audio')) return;
    if (event.key === 'Escape') { this.select(null); event.preventDefault(); }
    if (this.selectedPath && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      this.navigate(event.key === 'ArrowLeft' ? -1 : 1); event.preventDefault(); event.stopPropagation();
    }
  }

  private clearFilters(): void {
    const sort = this.plugin.data.defaultSort;
    this.filters = { query: '', kind: 'all', folder: null, tag: '', sort };
    this.filterBar.setQuery('');
    this.filterBar.setSort(sort);
    this.refresh();
  }

  private toggleSelectAll(): void {
    if (this.filtered.length && this.selection.size === this.filtered.length) this.selection.clear();
    else this.selection.selectAll(this.filtered.map(file => file.path));
    this.syncSelection();
  }

  /** After an import, show the folder of the first new file and open it. */
  private showImported(paths: string[]): void {
    const first = paths[0];
    Object.assign(this.filters, { query: '', kind: 'all', tag: '', collection: null, folder: first.includes('/') ? first.slice(0, first.lastIndexOf('/')) : '' });
    this.filterBar.setQuery('');
    this.refresh();
    this.select(first);
  }

  private async openFile(file: TFile): Promise<void> {
    try { await this.app.workspace.getLeaf('tab').openFile(file); }
    catch (error) { console.error(error); new Notice('Could not open this file in Obsidian.'); }
  }

  private async renameFile(file: TFile, newPath: string, draft: { tags: string[]; description: string }): Promise<void> {
    this.renaming = true;
    try {
      await this.app.fileManager.renameFile(file, newPath);
      // Vault's rename event migrates tags and notifies other gallery views.
      this.refresh();
      if (this.filtered.some(item => item.path === newPath)) { this.select(newPath); this.preview.restoreDraft(draft); }
    } finally { this.renaming = false; }
  }

  private sidebarHost() {
    const resetSelection = () => { this.selection.clear(); this.select(null); };
    const redraw = () => { this.renderSidebar(); this.applyFilters(); };
    return {
      collections: () => this.plugin.data.collections,
      showAllMedia: () => {
        Object.assign(this.filters, { folder: null, collection: null, kind: 'all', tag: '', query: '' });
        this.filterBar.setQuery(''); resetSelection(); redraw();
      },
      showFolder: (path: string) => { Object.assign(this.filters, { folder: path, collection: null }); resetSelection(); redraw(); },
      showCollection: (id: string) => { Object.assign(this.filters, { collection: id, folder: null }); redraw(); },
      newCollection: () => this.openCollections([]),
    };
  }

  private filterBarHost() {
    const change = (changes: Partial<Filters>) => { Object.assign(this.filters, changes); this.applyFilters(); };
    return {
      kindChosen: (kind: Filters['kind']) => { this.selection.clear(); this.select(null); change({ kind }); },
      queryChanged: (query: string) => change({ query }),
      tagChosen: (tag: string) => change({ tag }),
      sortChosen: (sort: Filters['sort']) => change({ sort }),
      thumbnailSizeChanged: () => this.setThumbnailSize(),
    };
  }

  private gridHost() {
    return {
      app: this.app,
      data: () => this.plugin.data,
      thumbnails: () => this.plugin.thumbnails,
      previewedPath: () => this.selectedPath,
      isChecked: (path: string) => this.selection.has(path),
      openPreview: (path: string) => this.select(path),
      checkFile: (path: string, checked: boolean, shift: boolean) => {
        this.selection.toggle(path, checked, shift, this.filtered.map(file => file.path));
        this.syncSelection();
      },
      pageRendered: () => this.syncSelection(),
    };
  }

  private previewHost() {
    return {
      app: this.app,
      plugin: this.plugin,
      knownTags: () => this.knownTags(),
      download: (path: string) => openDownloadDialog(this.app, [path]),
      openFile: (file: TFile) => { void this.openFile(file); },
      renameFile: (file: TFile, newPath: string, draft: { tags: string[]; description: string }) => this.renameFile(file, newPath, draft),
      previous: () => this.navigate(-1),
      next: () => this.navigate(1),
      close: () => {
        const path = this.selectedPath;
        this.select(null);
        (path && this.grid.cardButton(path) || this.contentEl).focus();
      },
    };
  }

  private selectionBarHost() {
    return {
      clear: () => { this.selection.clear(); this.syncSelection(); },
      addTags: (paths: string[]) => openTagsDialog({
        app: this.app, plugin: this.plugin, paths, knownTags: () => this.knownTags(),
        applied: tags => { if (this.selectedPath && paths.includes(this.selectedPath)) this.preview.addTags(tags); },
      }),
      addToCollection: (paths: string[]) => this.openCollections(paths),
      removeFromCollection: (paths: string[], remove: HTMLButtonElement) => this.removeFromCollection(paths, remove),
      download: (paths: string[]) => openDownloadDialog(this.app, paths),
      deleteFiles: (paths: string[]) => openDeleteDialog({
        app: this.app, plugin: this.plugin, paths,
        deleted: deleted => { for (const path of deleted) this.selection.remove(path); this.syncSelection(); },
      }),
    };
  }

  private openCollections(paths: string[]): void {
    openCollectionDialog({
      app: this.app, plugin: this.plugin, paths,
      created: id => { this.filters.collection = id; this.filters.folder = null; this.refresh(); },
    });
  }

  private removeFromCollection(paths: string[], remove: HTMLButtonElement): void {
    const collectionId = this.filters.collection;
    remove.disabled = true;
    void this.plugin.mutateData(data => {
      const collection = data.collections.find(item => item.id === collectionId);
      if (!collection) throw new Error('The collection no longer exists.');
      const selected = new Set(paths);
      collection.paths = collection.paths.filter(path => !selected.has(path));
    }).catch(error => { remove.disabled = false; this.plugin.reportSaveError(error); });
  }
}
