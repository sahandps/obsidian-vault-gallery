// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App } from 'obsidian';
import { mediaKind } from '../../backend/media/media-kinds';
import type MediaHubPlugin from '../../plugin';
import { ActionModal } from '../components/action-modal';
import { button, el } from '../dom';

export interface DeleteDialogOptions {
  app: App;
  plugin: MediaHubPlugin;
  paths: readonly string[];
  /** Called with the paths that were moved to trash. */
  deleted(paths: string[]): void;
}

/** Lists the files and asks for confirmation before moving them to the trash. */
export function openDeleteDialog(options: DeleteDialogOptions): void {
  const { app, plugin } = options;
  const files = app.vault.getFiles();
  const targets = options.paths.flatMap(path => {
    const file = files.find(item => item.path === path);
    return file && mediaKind(file.extension) ? [{ file, path }] : [];
  });
  if (!targets.length) return;
  const noun = targets.length === 1 ? 'file' : 'files';
  new ActionModal(app, `Delete ${targets.length} ${noun} from the vault?`, (body, close) => {
    el(body, 'p', 'vg-setting-hint', `The following ${targets.length} ${noun} will be removed from the vault and all collections, using your configured trash location. Removing files from a collection alone does not delete them.`);
    const list = el(body, 'ul', 'vg-delete-list');
    for (const target of targets) el(list, 'li', '', target.path);
    const status = el(body, 'p', 'vg-setting-hint'); status.setAttribute('role', 'status');
    const actions = el(body, 'div', 'vg-modal-actions');
    const cancel = button(actions, 'Cancel', null, close);
    const confirm = button(actions, `Move ${targets.length} ${noun} to trash`, null, () => {
      confirm.disabled = true; cancel.disabled = true; status.textContent = 'Moving files to trash…';
      void plugin.trashMedia(targets).then(result => {
        options.deleted(result.deleted);
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
