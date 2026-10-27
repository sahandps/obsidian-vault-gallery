// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { MediaKind } from '../backend/media/media-kinds';

export interface MediaTab { value: MediaKind | 'all'; label: string; icon: string }

export const MEDIA_TABS: MediaTab[] = [
  { value: 'all', label: 'All media', icon: 'layout-grid' },
  { value: 'image', label: 'Images', icon: 'image' },
  { value: 'gif', label: 'GIFs', icon: 'clapperboard' },
  { value: 'video', label: 'Videos', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'music' },
  { value: 'pdf', label: 'PDFs', icon: 'file-text' },
];

export function iconForKind(kind: MediaKind): string {
  return MEDIA_TABS.find(tab => tab.value === kind)!.icon;
}
