// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { App, TFile } from 'obsidian';
import { mediaKind, type MediaKind } from '../../../backend/media/media-kinds';
import type MediaHubPlugin from '../../../plugin';
import { el, stopMedia } from '../../dom';
import { FileInspector, type InspectorDraft } from './file-inspector';
import { MediaViewport } from './media-viewport';
import { PreviewToolbar } from './preview-toolbar';

export interface PreviewHost {
  app: App;
  plugin: MediaHubPlugin;
  knownTags(): string[];
  download(path: string): void;
  openFile(file: TFile): void;
  renameFile(file: TFile, newPath: string, draft: InspectorDraft): Promise<void>;
  previous(): void;
  next(): void;
  close(): void;
}

/** The expanded preview: media and tools on the left, file details on the right. */
export class PreviewPanel {
  readonly element: HTMLElement;
  private toolbar: PreviewToolbar | null = null;
  private inspector: FileInspector | null = null;

  constructor(parent: HTMLElement, private host: PreviewHost) {
    this.element = el(parent, 'section', 'vg-preview');
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Selected media');
  }

  /** Empties and hides the panel, stopping any playing media. */
  hide(): void {
    stopMedia(this.element);
    this.toolbar = null; this.inspector = null;
    this.element.replaceChildren();
    this.element.hidden = true;
  }

  show(file: TFile, index: number, total: number): void {
    this.hide();
    this.element.hidden = false;
    const kind = mediaKind(file.extension);
    this.buildStage(file, kind);
    this.toolbar?.updatePosition(index, total);
    this.inspector = new FileInspector(this.element, file, kind, {
      ...this.host,
      saveAgain: () => this.clickSave(),
    });
  }

  updatePosition(index: number, total: number): void { this.toolbar?.updatePosition(index, total); }
  focusNavigation(direction: number): void { this.toolbar?.focusButton(direction); }
  addTags(tags: readonly string[]): void { this.inspector?.addTags(tags); }
  restoreDraft(draft: InspectorDraft): void { this.inspector?.restoreDraft(draft); }
  clickSave(): void { this.inspector?.clickSave(); }

  private buildStage(file: TFile, kind: MediaKind | undefined): void {
    const stage = el(this.element, 'div', 'vg-stage');
    this.toolbar = new PreviewToolbar(stage, kind === 'image' || kind === 'gif', {
      previous: () => this.host.previous(),
      next: () => this.host.next(),
      close: () => this.host.close(),
      zoomBy: step => viewport.zoomBy(step),
      resetZoom: () => viewport.setZoom(1),
    });
    const viewport = new MediaViewport(stage, file, kind, {
      app: this.host.app,
      showInfo: text => this.inspector?.setInfo(text),
      openFile: target => this.host.openFile(target),
    });
  }
}
