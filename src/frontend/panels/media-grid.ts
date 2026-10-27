// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon, type App, type TFile } from 'obsidian';
import type { GalleryData } from '../../backend/data/gallery-data';
import { button, el, stopMedia } from '../dom';
import { renderMediaCard } from './media-card';

const PAGE_SIZE = 80;

export interface MediaGridHost {
  app: App;
  data(): GalleryData;
  previewedPath(): string | null;
  isChecked(path: string): boolean;
  openPreview(path: string): void;
  checkFile(path: string, checked: boolean, shift: boolean): void;
  pageRendered(): void;
}
export interface GridContext { totalFiles: number; inCollection: boolean }

/** The card grid. It renders in pages and loads the next page as the user scrolls. */
export class MediaGrid {
  readonly element: HTMLElement;
  private files: TFile[] = [];
  private visibleCount = PAGE_SIZE;
  private observer: IntersectionObserver | null = null;

  constructor(parent: HTMLElement, private host: MediaGridHost) {
    this.element = el(parent, 'div', 'vg-grid');
    this.element.setAttribute('aria-label', 'Media files');
  }

  render(files: TFile[], context: GridContext): void {
    this.files = files;
    this.visibleCount = PAGE_SIZE;
    this.redraw(context);
  }

  /** Redraws the current files, for example after a display setting changed. */
  redraw(context: GridContext): void {
    this.observer?.disconnect();
    stopMedia(this.element);
    this.element.replaceChildren();
    if (this.files.length === 0) this.renderEmptyState(context);
    else this.appendPage();
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
    return Array.from(this.element.querySelectorAll<HTMLButtonElement>('.vg-card-open')).find(item => item.dataset.path === path);
  }

  dispose(): void { this.observer?.disconnect(); }

  private renderEmptyState(context: GridContext): void {
    const { totalFiles, inCollection } = context;
    const empty = el(this.element, 'div', 'vg-empty');
    setIcon(el(empty, 'div', 'vg-empty-icon'), totalFiles ? 'search-x' : 'images');
    el(empty, 'h3', '', inCollection ? 'No matching media in this collection' : totalFiles ? 'No matching media' : 'A home for your media');
    el(empty, 'p', '', inCollection ? 'Select files in All media and use Add to collection, or clear your filters.' : totalFiles ? 'Try another folder, media type, tag, or search.' : 'Add images, GIFs, videos, audio, or PDFs to your vault. They will appear here automatically.');
  }

  private appendPage(): void {
    this.element.querySelector('.vg-load-more')?.remove();
    const start = this.element.querySelectorAll('.vg-card').length;
    for (const file of this.files.slice(start, this.visibleCount)) this.addCard(file);
    this.host.pageRendered();
    if (this.visibleCount < this.files.length) this.addLoadMore();
  }

  private addCard(file: TFile): void {
    renderMediaCard(this.element, file, {
      app: this.host.app,
      data: this.host.data(),
      previewed: file.path === this.host.previewedPath(),
      checked: this.host.isChecked(file.path),
      onOpen: () => this.host.openPreview(file.path),
      onCheck: (checked, shift) => this.host.checkFile(file.path, checked, shift),
    });
  }

  private addLoadMore(): void {
    const more = button(this.element, `Load more (${this.files.length - this.visibleCount} remaining)`, null, () => {
      this.observer?.disconnect();
      this.visibleCount += PAGE_SIZE;
      this.appendPage();
    }, 'vg-load-more');
    const Observer = this.element.ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) return;
    this.observer = new Observer(entries => {
      if (entries.some(entry => entry.isIntersecting)) more.click();
    }, { root: this.element.parentElement, rootMargin: '250px' });
    this.observer.observe(more);
  }
}
