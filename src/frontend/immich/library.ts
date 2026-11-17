// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { ImmichAlbum, ImmichAsset, ImmichClient } from '../../backend/immich/client';
import { referenceMarkdown } from '../../backend/immich/references';
import type MediaHubPlugin from '../../plugin';
import { button, el } from '../dom';
import { LazyLoader } from '../panels/lazy-loader';
import { ResultsHeading } from '../panels/results-heading';
import { SelectionState } from '../selection-state';
import { GallerySettingsModal } from '../settings/settings-modal';
import { immichError, MediaUrls } from './media';
import { ImmichNotePicker } from './note-picker';
import { ImmichPreview } from './preview';

interface LibraryHost {
  albums: (albums: ImmichAlbum[], selected: string | null) => void;
  count: (count: number) => void;
}

export class ImmichLibrary {
  readonly element: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly status: HTMLElement;
  private readonly results: ResultsHeading;
  private readonly selection = new SelectionState();
  private readonly selectionBar: HTMLElement;
  private readonly selectionCount: HTMLElement;
  private readonly format: HTMLSelectElement;
  private readonly albumError: HTMLElement;
  private readonly emptyActions: HTMLElement;
  private readonly more: HTMLButtonElement;
  private readonly search: HTMLInputElement;
  private readonly sort: HTMLSelectElement;
  private readonly tabs = new Map<ImmichAsset['type'] | '', HTMLButtonElement>();
  private client: ImmichClient | null = null;
  private album: string | null = null;
  private albums: ImmichAlbum[] = [];
  private assets: ImmichAsset[] = [];
  private nextPage: number | null = null;
  private kind: ImmichAsset['type'] | '' = '';
  private generation = 0;
  private connectionGeneration = 0;
  private thumbnailQueue: (() => Promise<void>)[] = [];
  private thumbnailCount = 0;
  private thumbnails?: LazyLoader;
  private urls = new MediaUrls();
  private searchTimer?: number;
  private preview?: ImmichPreview;

  constructor(parent: HTMLElement, private readonly plugin: MediaHubPlugin, private readonly host: LibraryHost) {
    this.element = el(parent, 'div', 'vg-immich-library');
    this.element.hidden = true;
    const nav = el(this.element, 'nav', 'vg-tabs');
    nav.setAttribute('aria-label', 'Immich media types');
    for (const [value, label, icon] of [['', 'All media', 'layout-grid'], ['IMAGE', 'Images', 'image'], ['VIDEO', 'Videos', 'film']] as const) {
      const tab = button(nav, label, icon, () => { this.kind = value; this.reload(); }, 'vg-tab');
      el(tab, 'span', '', label);
      this.tabs.set(value, tab);
    }
    const toolbar = el(this.element, 'div', 'vg-toolbar');
    const searchLabel = el(toolbar, 'label', 'vg-search');
    this.search = el(searchLabel, 'input');
    this.search.type = 'search'; this.search.placeholder = 'Search filenames…';
    this.search.setAttribute('aria-label', 'Search Immich filenames');
    this.search.addEventListener('input', () => {
      this.clearSearchTimer();
      // Drop stale results immediately; a slow response must not replace the new search.
      this.invalidate();
      this.resetGrid();
      this.status.textContent = 'Searching Immich…';
      this.searchTimer = this.element.ownerDocument.defaultView?.setTimeout(() => this.reload(), 300);
    });

    this.sort = el(toolbar, 'select', 'vg-select');
    this.sort.setAttribute('aria-label', 'Sort Immich media');
    for (const [value, label] of [['desc', 'Newest first'], ['asc', 'Oldest first']]) el(this.sort, 'option', '', label).value = value;
    this.sort.addEventListener('change', () => this.reload());
    const sizes = el(toolbar, 'label', 'vg-sizing');
    const slider = el(sizes, 'input');
    slider.type = 'range'; slider.min = '140'; slider.max = '360'; slider.step = '10';
    slider.value = String(plugin.data.thumbnailSize);
    slider.setAttribute('aria-label', 'Immich thumbnail size');
    slider.addEventListener('input', () => this.grid.setCssProps({ '--vg-card-size': slider.value + 'px' }));

    this.albumError = el(this.element, 'p', 'vg-immich-status vg-immich-album-error');
    this.albumError.setAttribute('role', 'status');
    this.scroll = el(this.element, 'div', 'vg-scroll');
    this.results = new ResultsHeading(this.scroll, {
      clearFilters: () => { this.kind = ''; this.search.value = ''; this.sort.value = 'desc'; this.reload(); },
      toggleSelectAll: () => {
        if (this.selection.size === this.assets.length) this.selection.clear();
        else this.selection.selectAll(this.assets.map(asset => asset.id));
        this.syncSelection();
      },
    });
    this.selectionBar = el(this.scroll, 'div', 'vg-selection-bar');
    this.selectionBar.setAttribute('aria-label', 'Selected Immich media actions');
    this.selectionCount = el(this.selectionBar, 'strong');
    this.selectionCount.setAttribute('role', 'status');
    button(this.selectionBar, 'Clear selection', null, () => { this.selection.clear(); this.syncSelection(); }, 'vg-text-button');
    this.format = el(this.selectionBar, 'select', 'vg-select');
    this.format.setAttribute('aria-label', 'Immich note reference format');
    el(this.format, 'option', '', 'Inline preview').value = 'embed';
    el(this.format, 'option', '', 'Link only').value = 'link';
    button(this.selectionBar, 'Insert into note', null, () => this.insert(this.assets.filter(asset => this.selection.has(asset.id))), 'mod-cta');
    this.status = el(this.scroll, 'p', 'vg-immich-status');
    this.status.setAttribute('role', 'status');
    this.emptyActions = el(this.scroll, 'div', 'vg-immich-actions');
    button(this.emptyActions, 'Connect Immich', null, () => new GallerySettingsModal(plugin.app, plugin).open(), 'mod-cta');
    this.grid = el(this.scroll, 'div', 'vg-grid');
    this.more = button(this.scroll, 'Load more', null, () => {
      if (this.nextPage !== null) void this.loadPage(this.nextPage, this.generation);
    }, 'vg-load-more');
    this.more.hidden = true;
    this.syncSelection();
  }

  open(album: string | null): void {
    const opening = this.element.hidden;
    const selecting = this.album !== album;
    this.element.hidden = false;
    this.album = album;
    if (opening) this.refreshConnection();
    else {
      this.host.albums(this.albums, this.album);
      if (selecting) { this.kind = ''; this.search.value = ''; this.reload(); }
    }
  }

  refreshConnection(reset = false): void {
    if (this.element.hidden) return;
    this.preview?.close();
    const version = ++this.connectionGeneration;
    this.client = this.plugin.immichClient();
    if (reset || !this.client) { this.albums = []; this.album = null; }
    this.host.albums(this.albums, this.album);
    if (this.client) {
      void this.client.albums().then(albums => {
        if (version !== this.connectionGeneration) return;
        this.albums = albums;
        if (this.album && !albums.some(album => album.id === this.album)) {
          this.album = null; this.reload();
        }
        this.results.setTitle(this.albums.find(album => album.id === this.album)?.name ?? 'Immich');
        this.host.albums(albums, this.album);
      }).catch(error => {
        if (version !== this.connectionGeneration) return;
        this.albums = []; this.host.albums([], this.album);
        this.albumError.textContent = 'Albums: ' + immichError(error);
      });
    }
    this.albumError.textContent = '';
    this.reload();
  }

  close(): void {
    this.element.hidden = true; this.connectionGeneration++;
    this.preview?.close();
    this.clearSearchTimer(); this.invalidate(); this.resetGrid();
    this.client = null; this.albums = [];
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== undefined) this.element.ownerDocument.defaultView?.clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
  }

  private invalidate(): void { this.generation++; this.thumbnailQueue = []; }

  private resetGrid(): void {
    this.thumbnails?.dispose();
    this.thumbnails = undefined;
    this.urls.dispose();
    this.urls = new MediaUrls();
    this.assets = []; this.nextPage = null; this.more.hidden = true;
    this.grid.replaceChildren();
    this.selection.clear(); this.syncSelection();
  }

  private reload(): void {
    this.clearSearchTimer(); this.invalidate(); this.resetGrid();
    const client = this.client;
    for (const [kind, tab] of this.tabs) {
      tab.setAttribute('aria-pressed', String(this.kind === kind));
      tab.disabled = !client;
    }
    this.search.disabled = !client; this.sort.disabled = !client;
    this.emptyActions.hidden = Boolean(client);
    this.results.setTitle(this.albums.find(album => album.id === this.album)?.name ?? 'Immich');
    this.host.count(0);
    if (!client) {
      this.status.textContent = 'Set your server URL and API key in Media Hub settings.';
      return;
    }
    void this.loadPage(1, this.generation);
  }

  private async loadPage(page: number, generation: number): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.more.disabled = true;
    this.status.textContent = 'Loading Immich media…';
    try {
      const result = await client.search({
        album: this.album ?? undefined, type: this.kind || undefined, name: this.search.value, page,
        order: this.sort.value === 'asc' ? 'asc' : 'desc',
      });
      if (this.generation !== generation) return;
      const known = new Set(this.assets.map(asset => asset.id));
      for (const asset of result.items) {
        if (known.has(asset.id)) continue;
        known.add(asset.id); this.assets.push(asset);
        this.renderCard(asset, client, generation);
      }
      this.nextPage = result.nextPage;
      this.more.hidden = this.nextPage === null;
      this.host.count(this.assets.length);
      this.status.textContent = this.assets.length ? '' : 'No matching media.';
      this.syncSelection();
    } catch (error) {
      if (this.generation !== generation) return;
      this.status.textContent = immichError(error);
    } finally {
      if (this.generation === generation) this.more.disabled = false;
    }
  }

  private renderCard(asset: ImmichAsset, client: ImmichClient, generation: number): void {
    const card = el(this.grid, 'div', 'vg-card');
    card.dataset.assetId = asset.id;
    const opener = button(card, 'Preview ' + asset.name, null, () => {
      const index = this.assets.findIndex(item => item.id === asset.id);
      this.preview = new ImmichPreview(this.plugin.app, client, [...this.assets], index, item => this.insert([item]), () => { this.preview = undefined; });
      this.preview.open();
    }, 'vg-card-open');
    opener.textContent = '';
    const checkbox = el(card, 'input', 'vg-select-checkbox');
    checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label', 'Select ' + asset.name);
    checkbox.addEventListener('click', event => {
      this.selection.toggle(asset.id, checkbox.checked, event.shiftKey, this.assets.map(item => item.id)); this.syncSelection();
    });
    const thumb = el(opener, 'div', 'vg-thumb');
    const placeholder = el(thumb, 'span', 'vg-no-preview', asset.type === 'VIDEO' ? 'Select to play' : 'Loading thumbnail…');
    if (asset.type !== 'VIDEO' || this.plugin.data.videoThumbnails) {
      const img = el(thumb, 'img'); img.alt = ''; img.hidden = true; img.decoding = 'async';
      this.thumbnails ??= new LazyLoader(this.scroll, this.element.ownerDocument);
      this.thumbnails.watch(thumb, () => this.queueThumbnail(async () => {
        if (generation !== this.generation) return;
        try {
          const blob = await client.image(asset.id, 'thumbnail');
          if (generation !== this.generation) return;
          const url = this.urls.make(blob);
          if (!url) return;
          img.onload = () => { img.hidden = false; placeholder.hidden = true; img.classList.add('is-loaded'); };
          img.onerror = () => { this.urls.drop(url); placeholder.textContent = 'Preview unavailable'; };
          img.src = url;
        } catch { if (generation === this.generation) placeholder.textContent = 'Preview unavailable'; }
      }));
    }
    const suffix = /\.([a-z0-9]{1,6})$/i.exec(asset.name)?.[1].toUpperCase();
    el(thumb, 'span', 'vg-badge', (suffix ?? (asset.type === 'VIDEO' ? 'VIDEO' : 'IMAGE')) + (asset.duration && asset.type === 'VIDEO' ? ' · ' + asset.duration : ''));
    const info = el(opener, 'div', 'vg-card-info');
    el(info, 'div', 'vg-card-name', asset.name);
    const date = new Date(asset.date);
    el(info, 'div', 'vg-card-subtitle', Number.isNaN(date.getTime()) ? 'Immich' : date.toLocaleDateString() + ' · Immich');
  }

  private queueThumbnail(job: () => Promise<void>): void { this.thumbnailQueue.push(job); this.drainThumbnails(); }

  private drainThumbnails(): void {
    while (this.thumbnailCount < 4 && this.thumbnailQueue.length) {
      const job = this.thumbnailQueue.shift()!;
      this.thumbnailCount++;
      void job().finally(() => { this.thumbnailCount--; this.drainThumbnails(); });
    }
  }

  private syncSelection(): void {
    this.selectionBar.hidden = this.selection.size === 0;
    this.selectionCount.textContent = this.selection.size + ' selected';
    this.results.setSelectAll(this.assets.length > 0 && this.selection.size === this.assets.length, this.assets.length > 0);
    for (const card of Array.from(this.grid.children) as HTMLElement[]) {
      const checked = this.selection.has(card.dataset.assetId ?? '');
      card.dataset.selected = String(checked);
      const checkbox = card.querySelector('input');
      if (checkbox) checkbox.checked = checked;
    }
  }

  private insert(items: ImmichAsset[]): void {
    if (!items.length || !this.client) return;
    const markdown = referenceMarkdown(this.client.server, items, this.format.value === 'link' ? 'link' : 'embed');
    new ImmichNotePicker(this.plugin.app, markdown).open();
  }
}
