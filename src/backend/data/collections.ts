// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { GalleryData, MediaCollection } from './gallery-data';

export function createCollection(data: GalleryData, name: string, paths: readonly string[] = []): MediaCollection {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a collection name.');
  if (data.collections.some(item => item.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('A collection with this name already exists.');
  const collection = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name: trimmed, paths: [...new Set(paths)] };
  data.collections.push(collection);
  return collection;
}
