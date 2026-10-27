// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App } from 'obsidian';
import { createCollection } from '../../backend/data/collections';
import type MediaHubPlugin from '../../plugin';
import { ActionModal } from '../components/action-modal';
import { button, el } from '../dom';

export interface CollectionDialogOptions {
  app: App;
  plugin: MediaHubPlugin;
  /** Files to add. Empty means "just create a collection". */
  paths: readonly string[];
  /** Called when an empty collection was created, so the gallery can open it. */
  created(id: string): void;
}

/** Creates a collection, or adds the selected files to a new or existing one. */
export function openCollectionDialog(options: CollectionDialogOptions): void {
  const { app, plugin, paths } = options;
  new ActionModal(app, paths.length ? `Add ${paths.length} files to a collection` : 'Create collection', (body, close) => {
    el(body, 'p', 'vg-setting-hint', 'Collections group files without moving or copying them. A file can belong to several collections.');
    const existing = paths.length ? addCollectionPicker(body, plugin) : null;
    const label = el(body, 'label', 'vg-setting-field'); el(label, 'span', '', 'New collection name');
    const name = el(label, 'input'); name.type = 'text'; name.placeholder = 'Travel'; name.setAttribute('aria-label', 'New collection name');
    existing?.addEventListener('change', () => { name.disabled = Boolean(existing.value); });
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
      void plugin.mutateData(data => {
        const available = new Set(app.vault.getFiles().map(file => file.path));
        const members = paths.filter(path => available.has(path));
        if (paths.length && !members.length) throw new Error('The selected files are no longer available.');
        if (existingId) {
          const collection = data.collections.find(item => item.id === existingId);
          if (!collection) throw new Error('The collection no longer exists.');
          collection.paths = [...new Set([...collection.paths, ...members])];
        } else targetId = createCollection(data, newName, members).id;
      }).then(() => {
        if (!paths.length) options.created(targetId);
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

function addCollectionPicker(body: HTMLElement, plugin: MediaHubPlugin): HTMLSelectElement {
  const label = el(body, 'label', 'vg-setting-field'); el(label, 'span', '', 'Collection');
  const select = el(label, 'select'); select.setAttribute('aria-label', 'Choose collection');
  const create = el(select, 'option', '', 'Create a new collection'); create.value = '';
  for (const collection of [...plugin.data.collections].sort((a, b) => a.name.localeCompare(b.name))) {
    const option = el(select, 'option', '', collection.name); option.value = collection.id;
  }
  return select;
}
