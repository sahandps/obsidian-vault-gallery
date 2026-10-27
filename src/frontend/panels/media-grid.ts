// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon, type App, type TFile } from 'obsidian';
import type { GalleryData } from '../../backend/data/gallery-data';
import { getMetadata } from '../../backend/data/metadata';
import type { ThumbnailService } from '../../backend/services/thumbnail-service';
import { button, el, stopMedia } from '../dom';
import { LazyLoader } from './lazy-loader';
import { renderMediaCard } from './media-card';

const PAGE_SIZE = 80;

export interface MediaGridHost {
  app: App;
  data(): GalleryData;
  thumbnails(): ThumbnailService | undefined;
  previewedPath(): string | null;
  isChecked(path: string): boolean;
  openPreview(path: string): void;
  checkFile(path: string, checked: boolean, shift: boolean): void;
  pageRendered(): void;
}
export interface GridContext { totalFiles: number; inCollection: boolean }

interface DrawnCard { element: HTMLElement; signature: string }

/**
 * The card grid. It renders in pages, loads the next page as the user scrolls, and keeps cards
 * that did not change, so filtering and refreshing do not reload every thumbnail.
 */
export class MediaGrid {
  readonly element: HTMLElement;
  private files: TFile[] = [];
  private visibleCount = PAGE_SIZE;
  private cards = new Map<string, DrawnCard>();
  private pageObserver: IntersectionObserver | null = null;
  private lazy: LazyLoader;

  constructor(parent: HTMLElement, private host: MediaGridHost) {
    this.element = el(parent, 'div', 'vg-grid');
    this.element.setAttribute('aria-label', 'Media files');
    this.lazy = new LazyLoader(parent, parent.ownerDocument);
  }

  render(files: TFile[], context: GridContext): void {
    this.files = files;
    this.visibleCount = PAGE_SIZE;
    this.reconcile(context);
  }

  /** Rebuilds every card, for example after a display setting changed. */
  redraw(context: GridContext): void {
    this.clearCards();
    this.reconcile(context);
  }

  /** Reflects which cards are checked. */
  syncChecked(isChecked: (path: string) => boolean): void {
    for (const card of Array.from(this.element.querySelectorAll<HTMLElement>('.vg-card'))) {
      const selected = isChecked(card.dataset.path || '');
      card.dataset.selected = String(selected);
      const checkbox = card.querySelector<HTMLInputElement>('.vg-select-checkbox');
      if (checkbox) checkbox.checked = selected;
    }
  }

  /** Marks the card whose preview is open. */
  markPreviewed(path: string | null): void {
    for (const open of Array.from(this.element.querySelectorAll<HTMLButtonElement>('.vg-card-open'))) {
      open.setAttribute('aria-pressed', String(open.dataset.path === path));
      const card = open.closest<HTMLElement>('.vg-card');
      if (card) card.dataset.previewed = String(open.dataset.path === path);
    }
  }

  cardButton(path: string): HTMLButtonElement | undefined {
    return this.cards.get(path)?.element.querySelector<HTMLButtonElement>('.vg-card-open') ?? undefined;
  }

  /** The thumbnail image of a card, used to animate the lightbox open and closed. */
  thumbnailImage(path: string): HTMLImageElement | undefined {
    return this.cards.get(path)?.element.querySelector<HTMLImageElement>('.vg-thumb img') ?? undefined;
  }

  dispose(): void { this.pageObserver?.disconnect(); this.lazy.dispose(); }

  private reconcile(context: GridContext): void {
    this.pageObserver?.disconnect();
    this.element.querySelector('.vg-load-more')?.remove();
    this.element.querySelector('.vg-empty')?.remove();
    const shown = this.files.slice(0, this.visibleCount);
    const keep = new Set(shown.map(file => file.path));
    for (const [path, card] of this.cards) if (!keep.has(path)) this.removeCard(path, card);
    shown.forEach((file, index) => {
      const card = this.cardFor(file);
      const current = this.element.children[index];
      if (current !== card) this.element.insertBefore(card, current ?? null);
    });
    if (!this.files.length) this.renderEmptyState(context);
    this.markPreviewed(this.host.previewedPath());
    this.host.pageRendered();
    if (this.visibleCount < this.files.length) this.addLoadMore(context);
  }

  /** Reuses the card when nothing about the file changed. */
  private cardFor(file: TFile): HTMLElement {
    const signature = this.signature(file);
    const existing = this.cards.get(file.path);
    if (existing?.signature === signature) return existing.element;
    if (existing) this.removeCard(file.path, existing);
    const element = renderMediaCard(this.element, file, {
      app: this.host.app,
      data: this.host.data(),
      thumbnails: this.host.thumbnails(),
      lazy: this.lazy,
      previewed: file.path === this.host.previewedPath(),
      checked: this.host.isChecked(file.path),
      onOpen: () => this.host.openPreview(file.path),
      onCheck: (checked, shift) => this.host.checkFile(file.path, checked, shift),
    });
    this.cards.set(file.path, { element, signature });
    return element;
  }

  private signature(file: TFile): string {
    const data = this.host.data();
    return [file.path, file.stat.mtime, file.stat.size, getMetadata(data, file.path).tags.join(','), data.videoThumbnails].join('|');
  }

  private removeCard(path: string, card: DrawnCard): void {
    stopMedia(card.element);
    card.element.remove();
    this.cards.delete(path);
  }

  private clearCards(): void {
    for (const [path, card] of [...this.cards]) this.removeCard(path, card);
  }

  private renderEmptyState(context: GridContext): void {
    const { totalFiles, inCollection } = context;
    const empty = el(this.element, 'div', 'vg-empty');
    setIcon(el(empty, 'div', 'vg-empty-icon'), totalFiles ? 'search-x' : 'images');
    el(empty, 'h3', '', inCollection ? 'No matching media in this collection' : totalFiles ? 'No matching media' : 'A home for your media');
    el(empty, 'p', '', inCollection ? 'Select files in All media and use Add to collection, or clear your filters.' : totalFiles ? 'Try another folder, media type, tag, or search.' : 'Add images, GIFs, videos, audio, or PDFs to your vault. They will appear here automatically.');
  }

  private addLoadMore(context: GridContext): void {
    const more = button(this.element, `Load more (${this.files.length - this.visibleCount} remaining)`, null, () => {
      this.visibleCount += PAGE_SIZE;
      this.reconcile(context);
    }, 'vg-load-more');
    const Observer = this.element.ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) return;
    this.pageObserver = new Observer(entries => {
      if (entries.some(entry => entry.isIntersecting)) more.click();
    }, { root: this.element.parentElement, rootMargin: '250px' });
    this.pageObserver.observe(more);
  }
}
