// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon, type TFile } from 'obsidian';
import type { MediaCollection } from '../../backend/data/gallery-data';
import { countFilesByFolder } from '../../backend/media/folder-counts';
import { button, el } from '../dom';

export interface SidebarHost {
  collections(): MediaCollection[];
  showAllMedia(): void;
  showFolder(path: string): void;
  showCollection(id: string): void;
  newCollection(): void;
}
export interface SidebarState { files: TFile[]; folder: string | null; collection: string | null | undefined }

/** The left pane: all media, collections and the folder tree. */
export class FolderSidebar {
  readonly element: HTMLElement;

  constructor(parent: HTMLElement, private host: SidebarHost) {
    this.element = el(parent, 'aside', 'vg-sidebar');
    this.element.setAttribute('aria-label', 'Media folders');
    this.element.id = `vg-folders-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  render(state: SidebarState): void {
    this.element.replaceChildren();
    const brand = el(this.element, 'div', 'vg-brand');
    setIcon(el(brand, 'span', 'vg-brand-icon'), 'images');
    el(brand, 'strong', '', 'Media Hub');
    el(this.element, 'div', 'vg-sidebar-label', 'LIBRARY');
    this.addRow('All media', 'library', state.files.length, 0, !state.collection && state.folder === null, () => this.host.showAllMedia());
    this.renderCollections(state);
    this.renderFolders(state);
    const footer = el(this.element, 'div', 'vg-sidebar-footer');
    setIcon(el(footer, 'span', 'vg-icon'), 'hard-drive');
    el(footer, 'span', '', 'Local files. Your vault.');
  }

  private renderCollections(state: SidebarState): void {
    const header = el(this.element, 'div', 'vg-collections-header');
    el(header, 'span', 'vg-sidebar-label', 'COLLECTIONS');
    button(header, 'New collection', 'plus', () => this.host.newCollection(), 'vg-icon-button');
    const knownPaths = new Set(state.files.map(file => file.path));
    for (const collection of [...this.host.collections()].sort((a, b) => a.name.localeCompare(b.name))) {
      const row = button(this.element, `Collection ${collection.name}`, null, () => this.host.showCollection(collection.id), 'vg-folder');
      row.setAttribute('aria-pressed', String(state.collection === collection.id));
      row.replaceChildren();
      setIcon(el(row, 'span', 'vg-icon'), 'album');
      el(row, 'span', 'vg-folder-name', collection.name);
      el(row, 'span', 'vg-folder-count', String(collection.paths.filter(path => knownPaths.has(path)).length));
    }
  }

  private renderFolders(state: SidebarState): void {
    el(this.element, 'div', 'vg-sidebar-label vg-folder-label', 'FOLDERS');
    const counts = countFilesByFolder(state.files);
    for (const [path, count] of [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
      const parts = path.split('/');
      const active = !state.collection && state.folder === path;
      this.addRow(path ? parts[parts.length - 1] : 'Vault root', 'folder', count, path ? parts.length - 1 : 0, active, () => this.host.showFolder(path), path || 'Vault root');
    }
  }

  private addRow(label: string, icon: string, count: number, depth: number, pressed: boolean, action: () => void, title = 'All media in the vault'): void {
    const row = button(this.element, label, null, action, 'vg-folder');
    row.setCssProps({ '--vg-depth': String(Math.min(depth, 5)) });
    row.title = title;
    row.setAttribute('aria-pressed', String(pressed));
    row.replaceChildren();
    setIcon(el(row, 'span', 'vg-icon'), icon);
    el(row, 'span', 'vg-folder-name', label);
    el(row, 'span', 'vg-folder-count', String(count));
  }
}
