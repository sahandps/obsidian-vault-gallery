// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only

/** Runs a callback the first time an element comes near the visible area. */
export class LazyLoader {
  private observer: IntersectionObserver | null = null;
  private callbacks = new WeakMap<Element, () => void>();

  /** `root` is the scrolling container; `margin` starts loading slightly before an element is visible. */
  constructor(private root: Element | null, private doc: Document, private margin = '400px') {}

  watch(element: Element, load: () => void): void {
    const Observer = this.doc.defaultView?.IntersectionObserver;
    if (!Observer) { load(); return; }
    this.observer ??= new Observer(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        this.observer?.unobserve(entry.target);
        this.callbacks.get(entry.target)?.();
      }
    }, { root: this.root, rootMargin: this.margin });
    this.callbacks.set(element, load);
    this.observer.observe(element);
  }

  dispose(): void { this.observer?.disconnect(); this.observer = null; }
}
