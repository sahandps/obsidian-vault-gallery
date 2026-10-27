// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Platform, type App } from 'obsidian';
import { androidFilesystem, saveAndroidFiles } from '../../backend/services/android-download';
import { EXPORT_LIMIT, exportPayload } from '../../backend/services/export-media';
import { ActionModal } from '../components/action-modal';
import { button, el } from '../dom';

/** Lets the user save copies of files to their device, with a desktop and an Android path. */
export function openDownloadDialog(app: App, paths: readonly string[]): void {
  new ActionModal(app, `Download ${paths.length} ${paths.length === 1 ? 'file' : 'files'}`, body => {
    el(body, 'p', 'vg-setting-hint', paths.length === 1 ? 'Save a copy on your device. The vault file is preserved.' : 'Save the selected files individually in their original formats. The vault files are preserved.');
    const status = el(body, 'p', 'vg-setting-hint', 'Preparing download…'); status.setAttribute('role', 'status');
    const actions = el(body, 'div', 'vg-modal-actions');
    const download = button(actions, 'Save to device', null, () => {}, 'mod-cta'); download.disabled = true;
    const owner = body.ownerDocument.defaultView;
    if (!owner) return;
    if (Platform.isAndroidApp) setUpAndroidSave(app, paths, owner, status, download);
    else void prepareDesktopCopies(app, paths, body, status, download).catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : 'Could not prepare download.';
    });
  }).open();
}

function setUpAndroidSave(app: App, paths: readonly string[], owner: Window, status: HTMLElement, download: HTMLButtonElement): void {
  const fs = androidFilesystem(owner);
  if (!fs) {
    status.textContent = 'Android file saving is unavailable. Please update Obsidian.';
    return;
  }
  status.textContent = 'Each download saves original files in a new folder at: Documents/Media Hub.';
  download.disabled = false;
  download.addEventListener('click', () => {
    download.disabled = true;
    status.textContent = 'Starting download…';
    const targets = paths.map(path => ({ path, read: async () => {
      const file = app.vault.getFiles().find(item => item.path === path);
      if (!file) throw new Error('File no longer exists.');
      if (file.stat.size > EXPORT_LIMIT) throw new Error('Files larger than 512 MB cannot be downloaded.');
      return app.vault.readBinary(file);
    } }));
    void saveAndroidFiles(fs, targets, message => { status.textContent = message; }).then(result => {
      status.textContent = `Saved ${result.saved.length} of ${paths.length} files to Documents/${result.folder}.${result.failed.length ? ` Failed: ${result.failed.join('; ')}` : ''}`;
    }).catch((error: unknown) => {
      status.textContent = `Download failed: ${error instanceof Error ? error.message : String(error)}`;
    }).finally(() => { download.disabled = false; });
  });
}

async function readSelectedFiles(app: App, paths: readonly string[]): Promise<{ path: string; bytes: ArrayBuffer }[]> {
  const files = app.vault.getFiles();
  const selected = paths.map(path => {
    const file = files.find(item => item.path === path);
    if (!file) throw new Error('A selected file is no longer available. Close and select again.');
    return { file, path };
  });
  if (selected.reduce((size, target) => size + target.file.stat.size, 0) > EXPORT_LIMIT) throw new Error('Select fewer files: exports are limited to 512 MB.');
  const entries = [];
  let size = 0;
  for (const target of selected) {
    if (target.file.path !== target.path) throw new Error('A selected file was renamed. Close and select again.');
    const bytes = await app.vault.readBinary(target.file);
    size += bytes.byteLength;
    if (size > EXPORT_LIMIT) throw new Error('Select fewer files: exports are limited to 512 MB.');
    entries.push({ path: target.path, bytes });
  }
  return entries;
}

async function prepareDesktopCopies(app: App, paths: readonly string[], body: HTMLElement, status: HTMLElement, download: HTMLButtonElement): Promise<void> {
  const entries = await readSelectedFiles(app, paths);
  const copies = exportPayload(entries);
  if (!body.isConnected) return;
  const saveCopy = (copy: File) => {
    const url = URL.createObjectURL(copy);
    const link = body.createEl('a', { text: copy.name });
    link.href = url; link.download = copy.name; link.hidden = true;
    link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = 'Download requested. If your device blocks multiple downloads, use the individual save buttons.';
  };
  download.disabled = false;
  download.addEventListener('click', () => { for (const copy of copies) saveCopy(copy); });
  if (copies.length > 1) {
    const list = el(body, 'div', 'vg-download-list');
    for (const [index, copy] of copies.entries()) {
      const row = el(list, 'div', 'vg-download-row');
      el(row, 'span', '', entries[index].path);
      button(row, `Save ${copy.name}`, 'download', () => saveCopy(copy));
    }
  }
  status.textContent = `${copies.length} ${copies.length === 1 ? 'file' : 'files'} ready to download.`;
}
