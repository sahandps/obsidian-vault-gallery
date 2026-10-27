// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App, TFile } from 'obsidian';
import { mediaKind, type MediaKind } from '../../backend/media/media-kinds';
import { el, stopMedia } from '../dom';
import { MediaViewport } from './media-viewport';
import { showUnavailable } from './unavailable';
import { ZoomableImage } from './zoomable-image';

export interface SlideHost {
  app: App;
  openFile(file: TFile): void;
  /** Called when a slide learns its dimensions or duration. */
  showInfo(slide: MediaSlide, text: string): void;
}

/** One page of the lightbox: an image, a video, an audio player or a PDF prompt. */
export class MediaSlide {
  readonly element: HTMLElement;
  readonly kind: MediaKind | undefined;
  image: ZoomableImage | null = null;
  /** Dimensions or duration, kept so the details panel can show them when this slide becomes current. */
  info = '';
  private player: MediaViewport | null = null;
  private active = false;

  constructor(parent: HTMLElement, readonly file: TFile, private host: SlideHost, placeholder?: string) {
    this.element = el(parent, 'div', 'vg-slide');
    this.kind = mediaKind(file.extension);
    // Images load straight away so neighbours are ready before the user swipes to them.
    if (this.kind === 'image' || this.kind === 'gif') this.showImage(placeholder);
  }

  setRole(role: number): void { this.element.setCssProps({ '--vg-role': String(role) }); }

  /** Starts players only for the slide being viewed, and stops them when it is left. */
  setCurrent(current: boolean): void {
    this.element.dataset.current = String(current);
    if (current === this.active) return;
    this.active = current;
    if (this.image) return;
    if (current) this.player = new MediaViewport(this.element, this.file, this.kind, {
      app: this.host.app,
      openFile: file => this.host.openFile(file),
      showInfo: text => this.host.showInfo(this, text),
    });
    else this.unload();
  }

  dispose(): void { this.unload(); this.element.remove(); }

  private unload(): void {
    stopMedia(this.element);
    this.player = null;
    if (!this.image) this.element.replaceChildren();
  }

  private showImage(placeholder?: string): void {
    this.image = new ZoomableImage(this.element, this.file, this.host.app, {
      placeholder,
      loaded: (width, height) => this.host.showInfo(this, `${width} × ${height} px`),
      failed: () => {
        this.image = null;
        this.element.replaceChildren();
        showUnavailable(this.element, 'This image format cannot be previewed on this device.');
      },
    });
  }
}
