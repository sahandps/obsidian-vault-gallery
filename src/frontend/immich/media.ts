// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { MarkdownRenderChild } from 'obsidian';
import { assetLink, type ImmichAsset, type ImmichClient } from '../../backend/immich/client';
import { parseReference } from '../../backend/immich/references';
import type MediaHubPlugin from '../../plugin';
import { button, el } from '../dom';
import { LazyLoader } from '../panels/lazy-loader';

export function immichError(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not load this item from Immich.';
}

export function openInImmich(parent: HTMLElement, server: string, id: string): HTMLAnchorElement {
  const link = el(parent, 'a', 'external-link', 'Open in Immich');
  link.href = assetLink(server, id);
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}

/** URLs here are only in memory, scoped to the view or embed that created them. */
export class MediaUrls {
  private urls = new Set<string>();
  private active = true;

  make(blob: Blob): string | undefined {
    if (!this.active) return;
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  drop(url: string): void { if (this.urls.delete(url)) URL.revokeObjectURL(url); }

  dispose(): void {
    this.active = false;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

export class ImmichPlayback {
  private urls = new MediaUrls();
  private video?: HTMLVideoElement;
  private closed = false;
  private loadingVideo = false;

  constructor(stage: HTMLElement, actions: HTMLElement, asset: ImmichAsset, client: ImmichClient) {
    const image = el(stage, 'img', 'vg-immich-preview-image');
    image.alt = asset.name;
    image.hidden = true;
    const status = el(stage, 'p', 'vg-immich-status', 'Loading preview…');
    status.setAttribute('role', 'status');
    void this.previewImage(asset, client).then(({ blob, message }) => {
      if (this.video) return;
      const url = this.urls.make(blob);
      if (!url) return;
      image.onerror = () => { image.hidden = true; if (!this.video) status.textContent = 'Preview unavailable.'; };
      image.src = url; image.hidden = false;
      if (!this.loadingVideo) status.textContent = message;
    }).catch(error => { if (!this.closed && !this.video) status.textContent = immichError(error); });

    if (asset.kind === 'video') {
      const play = button(actions, 'Play video', null, () => {
        play.disabled = true; this.loadingVideo = true;
        status.textContent = 'Loading video…';
        void client.video(asset.id).then(blob => {
          const url = this.urls.make(blob);
          if (!url) return;
          image.hidden = true;
          const video = this.video = el(stage, 'video', 'vg-immich-preview-video');
          video.controls = true; video.playsInline = true; video.src = url;
          status.textContent = '';
          video.onerror = () => {
            this.urls.drop(url); video.remove(); this.video = undefined; play.hidden = false; play.disabled = false;
            image.hidden = !image.hasAttribute('src');
            status.textContent = 'This video could not be played here. Try opening it in Immich.';
          };
          play.hidden = true;
          void video.play().catch(() => { /* Use the native play control if autoplay is blocked. */ });
        }).catch(error => { if (!this.closed) { status.textContent = immichError(error); play.disabled = false; } }).finally(() => { this.loadingVideo = false; });
      });
    }
    openInImmich(actions, client.server, asset.id);
  }

  private async previewImage(asset: ImmichAsset, client: ImmichClient): Promise<{ blob: Blob; message: string }> {
    if (asset.kind !== 'gif') {
      return { blob: await client.image(asset.id, asset.kind === 'video' ? 'thumbnail' : 'preview'), message: '' };
    }
    try {
      return { blob: await client.gif(asset.id), message: '' };
    } catch (error) {
      if (this.closed) throw error;
      // Keep a still preview when the API key only allows viewing derived media.
      try { return { blob: await client.image(asset.id, 'thumbnail'), message: immichError(error) }; }
      catch { throw error; }
    }
  }

  dispose(): void {
    this.closed = true;
    if (this.video) { this.video.onerror = null; this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
    this.urls.dispose();
  }
}

export class ImmichEmbed extends MarkdownRenderChild {
  private playback?: ImmichPlayback;
  private loader?: LazyLoader;
  private active = false;

  constructor(container: HTMLElement, private source: string, private plugin: MediaHubPlugin) { super(container); }

  onload(): void {
    this.active = true;
    const frame = el(this.containerEl, 'figure', 'vg-immich-embed');
    const status = el(frame, 'p', 'vg-immich-status', 'Immich media');
    status.setAttribute('role', 'status');
    this.loader = new LazyLoader(null, frame.ownerDocument);
    this.loader.watch(frame, () => { void this.render(frame, status); });
  }

  private async render(frame: HTMLElement, status: HTMLElement): Promise<void> {
    try {
      const ref = parseReference(this.source);
      const client = this.plugin.immichClient(ref.server);
      if (!client) {
        status.textContent = 'Connect this Immich server in Media Hub settings to preview this item.';
        openInImmich(frame, ref.server, ref.id);
        return;
      }
      status.textContent = 'Loading Immich media…';
      try {
        const asset = await client.asset(ref.id);
        if (!this.active) return;
        status.remove();
        const stage = el(frame, 'div', 'vg-immich-stage');
        el(frame, 'figcaption', '', asset.name);
        this.playback = new ImmichPlayback(stage, el(frame, 'div', 'vg-immich-actions'), asset, client);
      } catch (error) {
        if (!this.active) return;
        status.textContent = immichError(error);
        openInImmich(frame, ref.server, ref.id);
      }
    } catch { status.textContent = 'Invalid Immich media reference.'; }
  }

  onunload(): void {
    this.active = false; this.loader?.dispose(); this.playback?.dispose();
  }
}
