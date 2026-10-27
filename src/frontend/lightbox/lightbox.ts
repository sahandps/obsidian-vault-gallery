// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App, TFile } from 'obsidian';
import { mediaKind, type MediaKind } from '../../backend/media/media-kinds';
import type MediaHubPlugin from '../../plugin';
import { button, el, stopMedia } from '../dom';
import { FileInspector, type InspectorDraft } from './file-inspector';
import { GestureSurface } from './gestures';
import { playClose, playOpen } from './lightbox-animation';
import { createGestureHandlers } from './lightbox-gestures';
import { LightboxToolbar } from './lightbox-toolbar';
import { MediaSlide } from './media-slide';
import { SlideTrack } from './slide-track';

export interface LightboxHost {
  app: App;
  plugin: MediaHubPlugin;
  knownTags(): string[];
  download(path: string): void;
  openFile(file: TFile): void;
  renameFile(file: TFile, newPath: string, draft: InspectorDraft): Promise<void>;
  previous(): void;
  next(): void;
  close(): void;
  /** The files before and after the one being shown, in the gallery's current order. */
  neighbors(): { previous?: TFile; next?: TFile };
  /** The grid thumbnail for a file, used to fly the image out of and back into the grid. */
  originImage(path: string): HTMLImageElement | undefined;
}

const TYPING_TARGETS = 'input:not([type="checkbox"]), textarea, select, [contenteditable="true"], video, audio';

/** Full-screen viewer: swipe between files, pinch to zoom, drag down to close, with a details drawer. */
export class Lightbox {
  readonly element: HTMLElement;
  private backdrop: HTMLElement;
  private toolbarSlot: HTMLElement;
  private detailsButton: HTMLButtonElement;
  private drawer: HTMLElement;
  private arrows: Record<'previous' | 'next', HTMLButtonElement>;
  private track: SlideTrack;
  private gestures: GestureSurface;
  private toolbar: LightboxToolbar | null = null;
  private inspector: FileInspector | null = null;
  private file: TFile | null = null;
  private origin: HTMLImageElement | undefined;
  private animations: Animation[] = [];
  private closing = false;
  private backdropLevel = 1;

  constructor(doc: Document, private host: LightboxHost) {
    this.element = el(doc.body, 'div', 'vg-root vg-lightbox');
    this.element.hidden = true;
    this.element.tabIndex = -1;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', 'Selected media');
    this.backdrop = el(this.element, 'div', 'vg-lightbox-backdrop');
    const stage = el(this.element, 'div', 'vg-lightbox-stage');
    this.track = new SlideTrack(stage, (file, opening) => this.createSlide(file, opening));
    this.arrows = {
      previous: button(stage, 'Show previous', 'chevron-left', () => host.previous(), 'vg-lightbox-arrow is-previous'),
      next: button(stage, 'Show next', 'chevron-right', () => host.next(), 'vg-lightbox-arrow is-next'),
    };
    const bar = el(this.element, 'div', 'vg-lightbox-bar');
    this.toolbarSlot = el(bar, 'div', 'vg-lightbox-toolbar');
    this.detailsButton = button(bar, 'Show details', 'info', () => this.toggleDetails(), 'vg-icon-button vg-details-toggle');
    this.detailsButton.setAttribute('aria-pressed', 'false');
    this.drawer = el(this.element, 'aside', 'vg-lightbox-drawer');
    this.gestures = new GestureSurface(stage, createGestureHandlers({
      stage, track: this.track,
      next: () => host.next(), previous: () => host.previous(), close: () => host.close(),
      toggleChrome: () => this.element.classList.toggle('is-chrome-hidden'),
      setDismissProgress: progress => this.setDismissProgress(progress),
    }));
    this.element.addEventListener('keydown', event => this.handleKey(event));
  }

  /** Opens the viewer on a file, or slides to it when already open. */
  show(file: TFile, index: number, total: number): void {
    this.cancelClose();
    const wasOpen = !this.element.hidden;
    const kind = mediaKind(file.extension);
    const direction = wasOpen ? this.track.directionTo(file.path) : 0;
    this.file = file;
    this.element.hidden = false;
    this.origin = wasOpen ? undefined : this.host.originImage(file.path);
    this.buildToolbar(kind, index, total);
    this.element.classList.toggle('is-opening', !wasOpen);
    this.track.show({ ...this.host.neighbors(), current: file }, direction, !wasOpen);
    this.buildInspector(file, kind);
    this.arrows.previous.hidden = !this.track.hasNeighbor(-1);
    this.arrows.next.hidden = !this.track.hasNeighbor(1);
    if (!wasOpen) { this.element.focus(); void this.playOpening(); }
  }

  /** Closes the viewer, flying the image back into the grid where the browser allows it. */
  hide(): void {
    if (this.element.hidden || this.closing) return;
    stopMedia(this.element);
    const slide = this.track.current;
    const animations = slide && this.file ? playClose({
      backdrop: this.backdrop, slide: slide.element, image: slide.image ?? undefined,
      thumbnail: this.host.originImage(this.file.path),
    }, this.backdropLevel) : null;
    if (!animations) { this.finishClose(); return; }
    this.closing = true;
    this.animations = animations;
    this.element.classList.add('is-closing');
    Promise.all(animations.map(animation => animation.finished)).then(() => { if (this.closing) this.finishClose(); }, () => undefined);
  }

  updatePosition(index: number, total: number): void { this.toolbar?.updatePosition(index, total); }
  focusNavigation(direction: number): void { this.toolbar?.focusButton(direction); }
  addTags(tags: readonly string[]): void { this.inspector?.addTags(tags); }
  restoreDraft(draft: InspectorDraft): void { this.inspector?.restoreDraft(draft); }
  clickSave(): void { this.inspector?.clickSave(); }

  dispose(): void {
    this.cancelClose();
    this.gestures.dispose();
    this.track.clear();
    this.element.remove();
  }

  private createSlide(file: TFile, opening: boolean): MediaSlide {
    const thumbnail = opening ? this.origin : undefined;
    const placeholder = thumbnail?.complete && thumbnail.naturalWidth > 0 ? thumbnail.currentSrc || thumbnail.src : undefined;
    return new MediaSlide(this.track.element, file, {
      app: this.host.app,
      openFile: target => this.host.openFile(target),
      showInfo: (slide, text) => {
        slide.info = text;
        if (slide === this.track.current) this.inspector?.setInfo(text);
      },
    }, placeholder);
  }

  private buildToolbar(kind: MediaKind | undefined, index: number, total: number): void {
    this.toolbarSlot.replaceChildren();
    this.toolbar = new LightboxToolbar(this.toolbarSlot, kind === 'image' || kind === 'gif', {
      previous: () => this.host.previous(),
      next: () => this.host.next(),
      close: () => this.host.close(),
      zoomBy: step => this.track.current?.image?.step(step > 0),
      resetZoom: () => this.track.current?.image?.reset(),
    });
    this.toolbar.updatePosition(index, total);
  }

  private buildInspector(file: TFile, kind: MediaKind | undefined): void {
    this.drawer.replaceChildren();
    this.inspector = new FileInspector(this.drawer, file, kind, { ...this.host, saveAgain: () => this.clickSave() });
    const info = this.track.current?.info;
    if (info) this.inspector.setInfo(info);
  }

  private async playOpening(): Promise<void> {
    const slide = this.track.current;
    if (!slide) { this.element.classList.remove('is-opening'); return; }
    try {
      this.animations = await playOpen({ backdrop: this.backdrop, slide: slide.element, image: slide.image ?? undefined, thumbnail: this.origin });
    } finally { this.element.classList.remove('is-opening'); }
  }

  private finishClose(): void {
    this.cancelClose();
    this.toolbar = null; this.inspector = null; this.file = null;
    this.toolbarSlot.replaceChildren(); this.drawer.replaceChildren();
    this.track.clear();
    this.setDismissProgress(0);
    this.element.classList.remove('is-chrome-hidden', 'is-opening');
    this.element.hidden = true;
  }

  private cancelClose(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.closing = false;
    this.element.classList.remove('is-closing');
  }

  private setDismissProgress(progress: number): void {
    this.backdropLevel = 1 - 0.8 * progress;
    this.element.setCssProps({ '--vg-backdrop': String(this.backdropLevel) });
    this.element.classList.toggle('is-dragging', progress > 0);
  }

  private toggleDetails(): void {
    const open = !this.element.classList.contains('is-details-open');
    this.element.classList.toggle('is-details-open', open);
    this.detailsButton.setAttribute('aria-pressed', String(open));
    this.detailsButton.title = open ? 'Hide details' : 'Show details';
    this.detailsButton.setAttribute('aria-label', this.detailsButton.title);
  }

  private handleKey(event: KeyboardEvent): void {
    if ((event.target as HTMLElement).matches(TYPING_TARGETS)) return;
    const image = this.track.current?.image;
    const handled = ((): boolean => {
      switch (event.key) {
        case 'Escape': this.host.close(); return true;
        case 'ArrowLeft': this.host.previous(); return true;
        case 'ArrowRight': this.host.next(); return true;
        case 'i': this.toggleDetails(); return true;
        case '+': case '=': image?.step(true); return Boolean(image);
        case '-': image?.step(false); return Boolean(image);
        case '0': image?.reset(); return Boolean(image);
        default: return false;
      }
    })();
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }
}
