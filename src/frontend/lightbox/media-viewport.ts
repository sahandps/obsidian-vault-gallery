// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon, type App, type TFile } from 'obsidian';
import type { MediaKind } from '../../backend/media/media-kinds';
import { button, el } from '../dom';
import { showUnavailable } from './unavailable';

export interface ViewportHost {
  app: App;
  /** Reports the duration once the media has loaded. */
  showInfo(text: string): void;
  openFile(file: TFile): void;
}

/** Shows a video player, an audio player or a PDF prompt. Images use ZoomableImage instead. */
export class MediaViewport {
  private viewport: HTMLElement;

  constructor(parent: HTMLElement, private file: TFile, kind: MediaKind | undefined, private host: ViewportHost) {
    this.viewport = el(parent, 'div', 'vg-viewport');
    if (kind === 'video' || kind === 'audio') this.showPlayer(kind);
    else this.showPdf();
  }

  private showPlayer(kind: 'video' | 'audio'): void {
    if (kind === 'audio') setIcon(el(this.viewport, 'div', 'vg-audio-art'), 'music');
    const media = el(this.viewport, kind, 'vg-player');
    media.controls = true; media.preload = 'metadata';
    if (media instanceof this.viewport.ownerDocument.defaultView!.HTMLVideoElement) media.playsInline = true;
    media.src = this.host.app.vault.getResourcePath(this.file);
    media.addEventListener('loadedmetadata', () => {
      const seconds = media.duration;
      this.host.showInfo(Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : 'Unknown duration');
    });
    media.addEventListener('error', () => {
      this.viewport.replaceChildren();
      showUnavailable(this.viewport, 'This media format or codec cannot be played on this device.');
    }, { once: true });
  }

  private showPdf(): void {
    setIcon(el(this.viewport, 'div', 'vg-audio-art'), 'file-text');
    el(this.viewport, 'p', 'vg-preview-message', 'Open this PDF in Obsidian to read it.');
    button(this.viewport, 'Open PDF', null, () => this.host.openFile(this.file), 'mod-cta');
  }
}
