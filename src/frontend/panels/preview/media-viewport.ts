// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon, type App, type TFile } from 'obsidian';
import type { MediaKind } from '../../../backend/media/media-kinds';
import { button, el } from '../../dom';

export interface ViewportHost {
  app: App;
  /** Reports dimensions or duration once the media has loaded. */
  showInfo(text: string): void;
  openFile(file: TFile): void;
}

/** The large area that shows the selected image, video, audio or PDF. */
export class MediaViewport {
  private image: HTMLImageElement | null = null;
  private zoom = 1;
  private viewport: HTMLElement;

  constructor(parent: HTMLElement, private file: TFile, kind: MediaKind | undefined, private host: ViewportHost) {
    this.viewport = el(parent, 'div', 'vg-viewport');
    if (kind === 'image' || kind === 'gif') this.showImage();
    else if (kind === 'video' || kind === 'audio') this.showPlayer(kind);
    else this.showPdf();
  }

  zoomBy(step: number): void { this.setZoom(this.zoom + step); }

  setZoom(zoom: number): void {
    this.zoom = Math.min(4, Math.max(0.5, zoom));
    if (!this.image) return;
    this.image.setCssProps({ '--vg-preview-width': `${this.zoom * 100}%` });
    this.image.classList.toggle('vg-image-zoomed', this.zoom !== 1);
  }

  private showImage(): void {
    const image = el(this.viewport, 'img', 'vg-preview-image');
    this.viewport.classList.add('vg-image-viewport');
    this.image = image;
    image.alt = this.file.name;
    image.src = this.host.app.vault.getResourcePath(this.file);
    image.addEventListener('load', () => this.host.showInfo(`${image.naturalWidth} × ${image.naturalHeight} px`));
    image.addEventListener('error', () => {
      this.viewport.replaceChildren();
      this.viewport.classList.remove('vg-image-viewport');
      this.image = null;
      this.showUnavailable('This image format cannot be previewed on this device.');
    }, { once: true });
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
      this.showUnavailable('This media format or codec cannot be played on this device.');
    }, { once: true });
  }

  private showPdf(): void {
    setIcon(el(this.viewport, 'div', 'vg-audio-art'), 'file-text');
    el(this.viewport, 'p', 'vg-preview-message', 'Open this PDF in Obsidian to read it.');
    button(this.viewport, 'Open PDF', null, () => this.host.openFile(this.file), 'mod-cta');
  }

  private showUnavailable(message: string): void {
    setIcon(el(this.viewport, 'div', 'vg-audio-art'), 'file-question');
    el(this.viewport, 'p', 'vg-preview-message', message);
    el(this.viewport, 'p', 'vg-hint', 'Use “Open in Obsidian” or open the file in your system’s media app.');
  }
}
