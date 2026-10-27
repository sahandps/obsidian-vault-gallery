// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

export type MediaKind = 'image' | 'gif' | 'video' | 'audio' | 'pdf';

const extensions: Record<MediaKind, Set<string>> = {
  image: new Set(['avif', 'bmp', 'jpeg', 'jpg', 'png', 'svg', 'webp', 'heic', 'heif', 'tif', 'tiff', 'ico']),
  gif: new Set(['gif']),
  video: new Set(['mp4', 'webm', 'mov', 'mkv', 'ogv', 'avi', 'm4v', 'mpg', 'mpeg']),
  audio: new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'aiff', '3gp']),
  pdf: new Set(['pdf']),
};

/** Returns the kind of media a file extension stands for, or undefined for anything else. */
export function mediaKind(extension: string): MediaKind | undefined {
  const ext = extension.toLowerCase();
  return (Object.keys(extensions) as MediaKind[]).find(kind => extensions[kind].has(ext));
}

/** Value for a file input's `accept` attribute that allows every supported extension. */
export function mediaAccept(): string {
  return [...new Set(Object.values(extensions).flatMap(values => [...values]))].map(ext => `.${ext}`).join(',');
}
