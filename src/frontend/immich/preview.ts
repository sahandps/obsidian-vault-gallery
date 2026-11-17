// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { Modal, type App } from 'obsidian';
import type { ImmichAsset, ImmichClient } from '../../backend/immich/client';
import { button, el } from '../dom';
import { ImmichPlayback } from './media';

export class ImmichPreview extends Modal {
  private playback?: ImmichPlayback;

  constructor(app: App, private readonly client: ImmichClient, private readonly items: readonly ImmichAsset[],
    private index: number, private readonly insert: (asset: ImmichAsset) => void, private readonly closed: () => void) { super(app); }

  onOpen(): void { this.modalEl.classList.add('vg-immich-modal'); this.render(); }
  onClose(): void { this.playback?.dispose(); this.contentEl.replaceChildren(); this.closed(); }

  private render(): void {
    this.playback?.dispose();
    const asset = this.items[this.index];
    this.titleEl.textContent = asset.name;
    this.contentEl.replaceChildren();
    const navigation = el(this.contentEl, 'div', 'vg-preview-tools');
    const previous = button(navigation, 'Previous media', 'chevron-left', () => { this.index--; this.render(); }, 'vg-icon-button');
    const next = button(navigation, 'Next media', 'chevron-right', () => { this.index++; this.render(); }, 'vg-icon-button');
    previous.disabled = this.index === 0; next.disabled = this.index === this.items.length - 1;
    el(navigation, 'span', 'vg-position', `${this.index + 1} of ${this.items.length}`);
    const stage = el(this.contentEl, 'div', 'vg-immich-stage');
    const actions = el(this.contentEl, 'div', 'vg-immich-actions');
    this.playback = new ImmichPlayback(stage, actions, asset, this.client);
    button(actions, 'Insert into note', null, () => { this.close(); this.insert(asset); }, 'mod-cta');
  }
}
