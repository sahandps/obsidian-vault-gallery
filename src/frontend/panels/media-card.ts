// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon, type App, type TFile } from 'obsidian';
import type { GalleryData } from '../../backend/data/gallery-data';
import { getMetadata } from '../../backend/data/metadata';
import { formatSize } from '../../backend/media/file-names';
import { mediaKind, type MediaKind } from '../../backend/media/media-kinds';
import { button, el } from '../dom';
import { iconForKind } from '../media-tabs';

export interface CardOptions {
  app: App;
  data: GalleryData;
  previewed: boolean;
  checked: boolean;
  onOpen: () => void;
  onCheck: (checked: boolean, shiftKey: boolean) => void;
}

/** Draws one thumbnail card with its checkbox, badge, name and subtitle. */
export function renderMediaCard(grid: HTMLElement, file: TFile, options: CardOptions): void {
  const kind = mediaKind(file.extension)!;
  const card = el(grid, 'div', 'vg-card');
  card.dataset.path = file.path;
  card.dataset.previewed = String(options.previewed);
  const open = button(card, `Preview ${file.name}`, null, options.onOpen, 'vg-card-open');
  open.textContent = '';
  open.dataset.path = file.path;
  open.setAttribute('aria-pressed', String(options.previewed));
  const checkbox = el(card, 'input', 'vg-select-checkbox');
  checkbox.type = 'checkbox'; checkbox.checked = options.checked;
  checkbox.setAttribute('aria-label', `Select ${file.name}`);
  checkbox.addEventListener('click', event => options.onCheck(checkbox.checked, event.shiftKey));
  const thumb = el(open, 'div', 'vg-thumb');
  if (kind === 'image' || kind === 'gif') renderImageThumbnail(thumb, file, options.app);
  else renderPlaceholderThumbnail(thumb, file, kind, options);
  el(thumb, 'span', 'vg-badge', file.extension.toUpperCase());
  const info = el(open, 'div', 'vg-card-info');
  el(info, 'div', 'vg-card-name', file.name);
  el(info, 'div', 'vg-card-subtitle', subtitleFor(file, options.data));
}

function subtitleFor(file: TFile, data: GalleryData): string {
  const tags = getMetadata(data, file.path).tags;
  if (tags.length) return tags.map(tag => `#${tag}`).join('  ');
  return `${formatSize(file.stat.size)} · ${file.parent?.path === '/' ? 'Vault root' : file.parent?.path || 'Vault root'}`;
}

function renderImageThumbnail(thumb: HTMLElement, file: TFile, app: App): void {
  const image = el(thumb, 'img');
  image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
  image.src = app.vault.getResourcePath(file);
  image.addEventListener('error', () => {
    image.remove();
    setIcon(el(thumb, 'span', 'vg-file-icon'), 'image-off');
    el(thumb, 'span', 'vg-no-preview', 'Preview unavailable');
  }, { once: true });
}

function renderPlaceholderThumbnail(thumb: HTMLElement, file: TFile, kind: MediaKind, options: CardOptions): void {
  thumb.classList.add(`vg-thumb-${kind}`);
  setIcon(el(thumb, 'span', 'vg-file-icon'), iconForKind(kind));
  el(thumb, 'span', 'vg-no-preview', kind === 'video' ? 'Select to play' : kind === 'audio' ? 'Select to listen' : 'PDF document');
  if (kind !== 'video' || !options.data.videoThumbnails) return;
  const video = el(thumb, 'video', 'vg-video-thumbnail');
  video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  video.addEventListener('loadedmetadata', () => { if (video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2); }, { once: true });
  video.addEventListener('loadeddata', () => { video.classList.add('is-ready'); }, { once: true });
  video.addEventListener('error', () => video.remove(), { once: true });
  video.src = `${options.app.vault.getResourcePath(file)}#t=0.1`;
}
