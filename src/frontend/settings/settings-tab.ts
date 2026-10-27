// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { PluginSettingTab, type App, type Setting } from 'obsidian';
import type MediaHubPlugin from '../../plugin';
import { renderSettings } from './settings-form';

/** The Media Hub page under Obsidian's Settings. */
export class GallerySettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: MediaHubPlugin) { super(app, plugin); }
  // Obsidian 1.13+ indexes these names; earlier versions use display().
  getSettingDefinitions() {
    return [{
      name: 'Media import and layout',
      aliases: ['Default media folder', 'Thumbnail size', 'Collapse folder pane', 'Thumbnail fit', 'Compact spacing', 'Video thumbnails', 'Default sort order'],
      render: (setting: Setting) => {
        setting.settingEl.classList.add('vg-settings-row');
        renderSettings(setting.settingEl, this.plugin);
      },
    }];
  }
  display(): void { renderSettings(this.containerEl, this.plugin); }
}
