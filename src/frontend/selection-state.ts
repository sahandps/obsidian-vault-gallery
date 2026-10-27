// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

/** Which files the user has checked, plus the anchor used for Shift-click ranges. */
export class SelectionState {
  paths = new Set<string>();
  private anchor: string | null = null;

  get size(): number { return this.paths.size; }
  has(path: string): boolean { return this.paths.has(path); }
  toArray(): string[] { return [...this.paths]; }

  clear(): void { this.paths.clear(); this.anchor = null; }
  selectAll(paths: readonly string[]): void { this.paths = new Set(paths); }
  remove(path: string): void { this.paths.delete(path); }

  /** Checks or unchecks one file, or the whole range back to the anchor when Shift is held. */
  toggle(path: string, checked: boolean, shift: boolean, ordered: readonly string[]): void {
    const index = ordered.indexOf(path);
    const anchor = this.anchor ? ordered.indexOf(this.anchor) : -1;
    const range = shift && anchor >= 0 ? ordered.slice(Math.min(index, anchor), Math.max(index, anchor) + 1) : [path];
    for (const item of range) { if (checked) this.paths.add(item); else this.paths.delete(item); }
    this.anchor = path;
  }

  /** Drops selected files that are no longer visible. */
  keepOnly(visible: ReadonlySet<string>): void {
    this.paths = new Set([...this.paths].filter(path => visible.has(path)));
    if (this.anchor && !visible.has(this.anchor)) this.anchor = null;
  }

  /** Follows a renamed or moved file or folder. */
  move(oldPath: string, newPath: string): void {
    const moved = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
    this.paths = new Set([...this.paths].map(moved));
    if (this.anchor) this.anchor = moved(this.anchor);
  }
}
