// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';

export interface ImmichConnection { server: string; secretId: string }
export type ImmichMediaKind = 'image' | 'gif' | 'video';
export interface ImmichAsset { id: string; name: string; kind: ImmichMediaKind; date: string; duration: string }
export interface ImmichAlbum { id: string; name: string; count: number | null }
export interface AssetQuery { album?: string; kind?: ImmichMediaKind; name?: string; page?: number; size?: number; order?: 'asc' | 'desc' }
export interface AssetPage { items: ImmichAsset[]; nextPage: number | null }

export function normalizeServer(input: string): string {
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw new Error('Enter the full Immich URL, including https:// or http://.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Use an HTTP or HTTPS server URL without credentials, query parameters, or a fragment.');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
}

export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}

const idPath = (id: string) => {
  if (!isAssetId(id)) throw new Error('Invalid Immich ID.');
  return id;
};

export function assetLink(server: string, id: string): string { return normalizeServer(server) + '/photos/' + idPath(id); }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function readAsset(raw: unknown): ImmichAsset | null {
  const { id, type, originalFileName, originalPath, originalMimeType, fileCreatedAt, duration } = object(raw);
  if (!isAssetId(id) || (type !== 'IMAGE' && type !== 'VIDEO')) return null;
  const filename = typeof originalFileName === 'string' ? originalFileName.trim() : '';
  const path = typeof originalPath === 'string' ? originalPath : '';
  const gif = type === 'IMAGE' && (originalMimeType === 'image/gif' || /\.gif$/i.test(path) || /\.gif$/i.test(filename));
  const name = filename || (type === 'VIDEO' ? 'Immich video' : gif ? 'Immich GIF' : 'Immich photo');
  return {
    id, kind: type === 'VIDEO' ? 'video' : gif ? 'gif' : 'image',
    name: gif && !/\.gif$/i.test(name) ? name + '.gif' : name,
    date: typeof fileCreatedAt === 'string' ? fileCreatedAt : '',
    duration: typeof duration === 'string' ? duration : '',
  };
}

type Transport = (request: RequestUrlParam) => Promise<RequestUrlResponse>;
export class ImmichClient {
  readonly server: string;
  constructor(server: string, private readonly key: string, private readonly transport: Transport) {
    this.server = normalizeServer(server);
    if (!key.trim()) throw new Error('Add an Immich API key in Media Hub settings.');
  }

  private async request(path: string, body?: object, accessError = 'Immich denied access. Check the API key and its permissions.'): Promise<RequestUrlResponse> {
    let response: RequestUrlResponse;
    try {
      response = await this.transport({
        url: this.server + '/api' + path,
        method: body ? 'POST' : 'GET',
        headers: { 'x-api-key': this.key },
        ...(body ? { contentType: 'application/json', body: JSON.stringify(body) } : {}),
        throw: false,
      });
    } catch { throw new Error('Could not reach Immich. Check the server URL and your network.'); }
    if (response.status === 401 || response.status === 403) throw new Error(accessError);
    if (response.status === 404) throw new Error('Immich could not find this item or API endpoint.');
    if (response.status < 200 || response.status >= 300) throw new Error(`Immich returned HTTP ${response.status}.`);
    return response;
  }

  private async json(path: string, body?: object): Promise<unknown> {
    const response = await this.request(path, body);
    try { return response.json; } catch { throw new Error('Expected JSON from Immich. Check the server URL and any reverse proxy login.'); }
  }

  async albums(): Promise<ImmichAlbum[]> {
    const data = await this.json('/albums');
    if (!Array.isArray(data)) throw new Error('Immich returned an unexpected album list.');
    return data.flatMap(entry => {
      const { id, albumName, assetCount } = object(entry);
      if (!isAssetId(id) || typeof albumName !== 'string') return [];
      return [{ id, name: albumName, count: typeof assetCount === 'number' ? assetCount : null }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  async search(query: AssetQuery = {}): Promise<AssetPage> {
    const page = query.page ?? 1;
    const name = query.name?.trim();
    const data = object(await this.json('/search/metadata', {
      page, size: query.size ?? 48, order: query.order ?? 'desc', withExif: false,
      ...(query.kind ? { type: query.kind === 'video' ? 'VIDEO' : 'IMAGE' } : {}),
      // Immich indexes GIFs as IMAGE. Narrow GIF searches on the server; verify the format below.
      ...(query.kind === 'gif' ? { originalPath: '.gif' } : {}),
      ...(query.album ? { albumIds: [idPath(query.album)] } : {}),
      ...(name ? { originalFileName: name } : {}),
    }));
    const assets = object(data.assets);
    if (!Array.isArray(assets.items)) throw new Error('Immich returned an unexpected media list.');
    const next = Number(assets.nextPage);
    return { items: assets.items.map(readAsset).filter((item): item is ImmichAsset => item !== null && (!query.kind || item.kind === query.kind)), nextPage: Number.isSafeInteger(next) && next > page ? next : null };
  }

  async asset(id: string): Promise<ImmichAsset> {
    const asset = readAsset(await this.json('/assets/' + idPath(id)));
    if (!asset || asset.id.toLowerCase() !== id.toLowerCase()) throw new Error('Immich returned an unexpected media item.');
    return asset;
  }

  async image(id: string, size: 'thumbnail' | 'preview'): Promise<Blob> {
    const response = await this.request('/assets/' + idPath(id) + '/thumbnail?size=' + size);
    return this.mediaBlob(response, 'image');
  }

  async gif(id: string): Promise<Blob> {
    const response = await this.request('/assets/' + idPath(id) + '/original', undefined,
      'To play this GIF, use an Immich API key with asset.download permission.');
    const blob = this.mediaBlob(response, 'image');
    if (blob.type !== 'image/gif') throw new Error('Immich did not return an animated GIF.');
    return blob;
  }

  async video(id: string): Promise<Blob> {
    const response = await this.request('/assets/' + idPath(id) + '/video/playback');
    return this.mediaBlob(response, 'video');
  }

  private mediaBlob(response: RequestUrlResponse, kind: 'image' | 'video'): Blob {
    const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1].split(';')[0].trim().toLowerCase();
    if (!type?.startsWith(kind + '/') || !response.arrayBuffer.byteLength) throw new Error(`Immich did not return a playable ${kind}.`);
    return new Blob([response.arrayBuffer], { type });
  }
}
