// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Modal, PluginSettingTab, TFolder, type App, type Setting } from 'obsidian';
import type MediaHubPlugin from './main';
import { normalizeImportFolder } from './model';

function renderSettings(container: HTMLElement, plugin: MediaHubPlugin): void {
  container.replaceChildren();
  container.classList.add('vg-settings');
  container.createEl('h2', { text: 'Media Hub' });
  const folderLabel = container.createEl('label', { cls: 'vg-setting-field' });
  folderLabel.createEl('strong', { text: 'Default media folder' });
  const folder = folderLabel.createEl('input', { type: 'text', value: plugin.data.importFolder, placeholder: 'Media' });
  folder.setAttribute('aria-label', 'Default media folder');
  container.createEl('p', { cls: 'vg-setting-hint', text: 'Added files are copied into this vault folder. Enter a new path to create it on import, or leave empty for the vault root. Existing media is not moved.' });
  const existingLabel = container.createEl('label', { cls: 'vg-setting-field' });
  existingLabel.createSpan({ text: 'Or choose an existing folder' });
  const existing = existingLabel.createEl('select');
  existing.setAttribute('aria-label', 'Existing media folder');
  const placeholder = existing.createEl('option', { text: 'Choose a folder…', value: 'choose' });
  placeholder.disabled = true; placeholder.selected = true;
  existing.createEl('option', { text: 'Vault root', value: '' });
  const folders = plugin.app.vault.getAllLoadedFiles().filter((entry): entry is TFolder => entry instanceof TFolder && entry.path !== '/');
  for (const entry of folders.sort((a, b) => a.path.localeCompare(b.path))) existing.createEl('option', { text: entry.path, value: entry.path });
  existing.addEventListener('change', () => { folder.value = existing.value; });
  const collapsedLabel = container.createEl('label', { cls: 'vg-setting-check' });
  const collapsed = collapsedLabel.createEl('input', { type: 'checkbox' });
  collapsed.checked = plugin.data.sidebarCollapsed;
  collapsedLabel.createSpan({ text: 'Collapse the folder pane' });
  const sizeLabel = container.createEl('label', { cls: 'vg-setting-field' });
  sizeLabel.createSpan({ text: 'Thumbnail size' });
  const size = sizeLabel.createEl('input', { type: 'range' });
  size.min = '140'; size.max = '360'; size.step = '10'; size.value = String(plugin.data.thumbnailSize);
  size.setAttribute('aria-label', 'Default thumbnail size');
  const status = container.createEl('p', { cls: 'vg-setting-hint' });
  status.setAttribute('role', 'status');
  const save = container.createEl('button', { cls: 'mod-cta', text: 'Save settings' });
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      let path: string;
      try {
        path = normalizeImportFolder(folder.value);
        const target = path ? plugin.app.vault.getAbstractFileByPath(path) : null;
        if (target && !(target instanceof TFolder)) throw new Error('A file already uses this folder path.');
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Invalid folder path.';
        return;
      }
      const previous = { importFolder: plugin.data.importFolder, sidebarCollapsed: plugin.data.sidebarCollapsed, thumbnailSize: plugin.data.thumbnailSize };
      plugin.data.importFolder = path;
      plugin.data.sidebarCollapsed = collapsed.checked;
      plugin.data.thumbnailSize = Number(size.value);
      const controls = [folder, existing, collapsed, size, save];
      controls.forEach(control => { control.disabled = true; }); status.textContent = 'Saving…';
      try {
        await plugin.persist();
        folder.value = path;
        plugin.applyViewSettings();
        status.textContent = 'Settings saved.';
      } catch (error) {
        plugin.data.importFolder = previous.importFolder;
        plugin.data.sidebarCollapsed = previous.sidebarCollapsed;
        plugin.data.thumbnailSize = previous.thumbnailSize;
        status.textContent = 'Could not save settings. Try again.';
        plugin.reportSaveError(error);
      } finally { controls.forEach(control => { control.disabled = false; }); }
    })();
  });
}

export class GallerySettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: MediaHubPlugin) { super(app, plugin); }
  // Obsidian 1.13+ indexes these names; earlier versions use display().
  getSettingDefinitions() {
    return [{
      name: 'Media import and layout',
      aliases: ['Default media folder', 'Thumbnail size', 'Collapse folder pane'],
      render: (setting: Setting) => {
        setting.settingEl.classList.add('vg-settings-row');
        renderSettings(setting.settingEl, this.plugin);
      },
    }];
  }
  display(): void { renderSettings(this.containerEl, this.plugin); }
}
export class GallerySettingsModal extends Modal {
  constructor(app: App, private plugin: MediaHubPlugin) { super(app); }
  onOpen(): void {
    this.titleEl.textContent = 'Gallery settings';
    renderSettings(this.contentEl, this.plugin);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}
