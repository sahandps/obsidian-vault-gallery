// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { immichSecrets } from '../../backend/immich/secrets';
import type MediaHubPlugin from '../../plugin';
import { button, el } from '../dom';
import { immichError } from './media';

export function renderImmichSettings(container: HTMLElement, plugin: MediaHubPlugin): void {
  const section = el(container, 'section', 'vg-immich-settings');
  el(section, 'h3', '', 'Immich');
  if (!immichSecrets(plugin.app)) {
    el(section, 'p', 'vg-setting-hint', 'Immich requires Obsidian 1.11.4 or newer for API key storage.');
    return;
  }
  el(section, 'p', 'vg-setting-hint', 'Browse and reference media without importing files. In Immich, create an API key with asset.read, asset.view, and album.read permissions.');
  const serverLabel = el(section, 'label', 'vg-setting-field', 'Server URL');
  const server = el(serverLabel, 'input'); server.type = 'url'; server.placeholder = 'https://photos.example.com'; server.value = plugin.data.immich?.server ?? '';
  const keyLabel = el(section, 'label', 'vg-setting-field', 'API key');
  const key = el(keyLabel, 'input'); key.type = 'password'; key.autocomplete = 'off';
  const status = el(section, 'p', 'vg-setting-hint');
  status.setAttribute('role', 'status');
  const controls = el(section, 'div', 'vg-immich-actions');
  const connect = button(controls, 'Test and connect', null, () => { void save(false); }, 'mod-cta');
  const disconnect = button(controls, 'Disconnect', null, () => { void save(true); });
  const update = () => {
    disconnect.hidden = !plugin.data.immich;
    key.placeholder = plugin.immichClient() ? 'Stored in Obsidian · enter a new key to replace' : 'Enter your Immich API key';
  };
  const save = async (remove: boolean) => {
    const inputs = [server, key, connect, disconnect];
    inputs.forEach(input => { input.disabled = true; });
    status.textContent = remove ? 'Disconnecting…' : 'Testing Immich access…';
    try {
      if (remove) { await plugin.disconnectImmich(); server.value = ''; }
      else { await plugin.connectImmich(server.value, key.value); server.value = plugin.data.immich?.server ?? server.value; }
      key.value = ''; update();
      status.textContent = remove ? 'Disconnected.' : 'Connected to Immich.';
    } catch (error) { status.textContent = immichError(error); }
    finally { inputs.forEach(input => { input.disabled = false; }); }
  };
  update();
}
