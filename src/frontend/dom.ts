// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { setIcon } from 'obsidian';

/** Creates a child element with an optional class name and text. */
export function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  return parent.createEl(tag, { cls, text });
}

/** Creates a button showing an icon (or its label when there is no icon). */
export function button(parent: HTMLElement, label: string, icon: string | null, action: () => void, cls = ''): HTMLButtonElement {
  const node = el(parent, 'button', cls);
  node.type = 'button';
  node.title = label;
  node.setAttribute('aria-label', label);
  if (icon) setIcon(el(node, 'span', 'vg-icon'), icon);
  else node.textContent = label;
  node.addEventListener('click', action);
  return node;
}

/** Pauses and unloads every video and audio element inside the root. */
export function stopMedia(root: HTMLElement): void {
  root.querySelectorAll('video, audio').forEach(node => {
    const media = node as HTMLMediaElement;
    media.pause();
    media.removeAttribute('src');
    media.load();
  });
}
