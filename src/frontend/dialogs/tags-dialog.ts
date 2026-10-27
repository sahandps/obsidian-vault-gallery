// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App } from 'obsidian';
import { getMetadata, parseTags } from '../../backend/data/metadata';
import type MediaHubPlugin from '../../plugin';
import { ActionModal } from '../components/action-modal';
import { TagEditor } from '../components/tag-editor';
import { button, el } from '../dom';

export interface TagsDialogOptions {
  app: App;
  plugin: MediaHubPlugin;
  paths: readonly string[];
  knownTags(): string[];
  applied(tags: string[]): void;
}

/** Adds the same tags to every selected file, keeping existing tags and descriptions. */
export function openTagsDialog(options: TagsDialogOptions): void {
  const { app, plugin, paths } = options;
  new ActionModal(app, `Add tags to ${paths.length} files`, (body, close) => {
    el(body, 'p', 'vg-setting-hint', 'These tags will be added to every selected file. Existing tags and descriptions are preserved.');
    const editor = new TagEditor(body, [], () => options.knownTags(), undefined, 'Tags to add');
    const status = el(body, 'p', 'vg-setting-hint'); status.setAttribute('role', 'status');
    const actions = el(body, 'div', 'vg-modal-actions');
    const cancel = button(actions, 'Cancel', null, close);
    const apply = button(actions, 'Apply tags', null, () => {
      const tags = editor.getTags();
      if (!tags.length) { status.textContent = 'Add at least one tag.'; return; }
      apply.disabled = true; cancel.disabled = true; editor.setDisabled(true);
      void plugin.mutateData(data => {
        const available = new Set(app.vault.getFiles().map(file => file.path));
        for (const path of paths) {
          if (!available.has(path)) continue;
          const previous = getMetadata(data, path);
          data.metadata[path] = { tags: parseTags([...previous.tags, ...tags].join(',')), description: previous.description };
        }
      }).then(() => {
        options.applied(tags);
        close();
      }).catch(error => {
        status.textContent = 'Could not save tags. Try again.';
        apply.disabled = false; cancel.disabled = false; editor.setDisabled(false);
        plugin.reportSaveError(error);
      });
    }, 'mod-cta');
  }).open();
}
