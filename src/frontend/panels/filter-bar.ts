// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon } from 'obsidian';
import type { SortOrder } from '../../backend/data/gallery-data';
import type { Filters } from '../../backend/media/media-filter';
import type { MediaKind } from '../../backend/media/media-kinds';
import type MediaHubPlugin from '../../plugin';
import { button, el } from '../dom';
import { MEDIA_TABS } from '../media-tabs';

export interface FilterBarHost {
  kindChosen(kind: MediaKind | 'all'): void;
  queryChanged(query: string): void;
  tagChosen(tag: string): void;
  sortChosen(sort: SortOrder): void;
  thumbnailSizeChanged(): void;
}

const SORT_CHOICES = [['newest', 'Recently modified'], ['oldest', 'Oldest modified'], ['name', 'Name A–Z'], ['largest', 'Largest first']];

/** Media type tabs, search box, tag filter, sort order and thumbnail size slider. */
export class FilterBar {
  private tabs = new Map<string, HTMLButtonElement>();
  private search!: HTMLInputElement;
  private tagSelect!: HTMLSelectElement;
  private sort!: HTMLSelectElement;
  private slider!: HTMLInputElement;

  constructor(parent: HTMLElement, private plugin: MediaHubPlugin, private host: FilterBarHost) {
    this.buildTabs(parent);
    const toolbar = el(parent, 'div', 'vg-toolbar');
    this.buildSearch(toolbar);
    this.buildTagSelect(toolbar);
    this.buildSort(toolbar);
    this.buildSizeSlider(toolbar);
  }

  /** Shows the filter state: active tab and tag. */
  showFilters(filters: Filters): void {
    for (const [kind, tab] of this.tabs) tab.setAttribute('aria-pressed', String(filters.kind === kind));
    this.tagSelect.value = filters.tag;
  }

  setQuery(query: string): void { this.search.value = query; }
  setSort(sort: SortOrder): void { this.sort.value = sort; }
  setThumbnailSize(size: number): void { this.slider.value = String(size); }

  setTagOptions(tags: string[], selected: string): void {
    this.tagSelect.replaceChildren();
    const all = el(this.tagSelect, 'option', '', 'All tags'); all.value = '';
    for (const tag of tags) { const option = el(this.tagSelect, 'option', '', `#${tag}`); option.value = tag; }
    this.tagSelect.value = selected;
  }

  private buildTabs(parent: HTMLElement): void {
    const bar = el(parent, 'nav', 'vg-tabs');
    bar.setAttribute('aria-label', 'Media types');
    for (const kind of MEDIA_TABS) {
      const tab = button(bar, kind.label, null, () => this.host.kindChosen(kind.value), 'vg-tab');
      tab.replaceChildren();
      setIcon(el(tab, 'span', 'vg-icon'), kind.icon);
      el(tab, 'span', '', kind.label);
      this.tabs.set(kind.value, tab);
    }
  }

  private buildSearch(toolbar: HTMLElement): void {
    const wrap = el(toolbar, 'div', 'vg-search');
    setIcon(el(wrap, 'span', 'vg-icon'), 'search');
    this.search = el(wrap, 'input');
    this.search.type = 'search';
    this.search.placeholder = 'Search names, tags, descriptions…';
    this.search.setAttribute('aria-label', 'Search media');
    this.search.addEventListener('input', () => this.host.queryChanged(this.search.value));
  }

  private buildTagSelect(toolbar: HTMLElement): void {
    this.tagSelect = el(toolbar, 'select', 'vg-select');
    this.tagSelect.setAttribute('aria-label', 'Filter by tag');
    this.tagSelect.addEventListener('change', () => this.host.tagChosen(this.tagSelect.value));
  }

  private buildSort(toolbar: HTMLElement): void {
    this.sort = el(toolbar, 'select', 'vg-select');
    this.sort.setAttribute('aria-label', 'Sort media');
    for (const [value, label] of SORT_CHOICES) {
      const option = el(this.sort, 'option', '', label);
      option.value = value;
    }
    this.sort.addEventListener('change', () => this.host.sortChosen(this.sort.value as SortOrder));
  }

  private buildSizeSlider(toolbar: HTMLElement): void {
    const sizing = el(toolbar, 'label', 'vg-sizing');
    setIcon(el(sizing, 'span', 'vg-icon'), 'grid-2x2');
    this.slider = el(sizing, 'input');
    this.slider.type = 'range'; this.slider.min = '140'; this.slider.max = '360'; this.slider.step = '10';
    this.slider.value = String(this.plugin.data.thumbnailSize);
    this.slider.setAttribute('aria-label', 'Thumbnail size');
    this.slider.addEventListener('input', () => {
      this.plugin.data.thumbnailSize = Number(this.slider.value);
      this.host.thumbnailSizeChanged();
    });
    this.slider.addEventListener('change', () => {
      void this.plugin.persist().catch(error => this.plugin.reportSaveError(error));
    });
  }
}
