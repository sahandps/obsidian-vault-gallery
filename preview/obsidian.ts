import { createElement, icons } from 'lucide';
import type { IconNode } from 'lucide';
export class ItemView {
  app: any;
  contentEl: HTMLElement;
  constructor(public leaf: any) {
    this.app = leaf.app; this.contentEl = leaf.contentEl;
    const win = this.contentEl.ownerDocument.defaultView!;
    const prototype = win.HTMLElement.prototype;
    prototype.createEl = function(this: HTMLElement, tag: string, options: { cls?: string; text?: string; type?: string; value?: string; placeholder?: string } = {}) {
      const element = this.ownerDocument.createElement(tag);
      element.className = options.cls || ''; element.textContent = options.text || '';
      for (const key of ['type', 'value', 'placeholder'] as const) if (options[key] !== undefined) element.setAttribute(key, options[key]!);
      this.appendChild(element); return element;
    } as typeof prototype.createEl;
    prototype.createSpan = function(options = {}) { return this.createEl('span', options); };
    prototype.setCssProps = function(this: HTMLElement, props: Record<string, string>) {
      for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value);
    };
  }
  registerDomEvent(element: HTMLElement, type: string, listener: EventListener) { element.addEventListener(type, listener); }
}
export class Plugin {
  app: any;
  factory: any;
  async loadData() { return JSON.parse(localStorage.getItem('vault-gallery-preview') || 'null'); }
  async saveData(data: unknown) { localStorage.setItem('vault-gallery-preview', JSON.stringify(data)); }
  registerView(_type: string, factory: any) { this.factory = factory; }
  registerEvent() {}
  addRibbonIcon() {}
  addCommand() {}
  addSettingTab(tab: any) { this.settingsTab = tab; }
  settingsTab: any;
}
export class TFile {}
export class TFolder { constructor(public path: string) {} }
export class PluginSettingTab {
  containerEl: HTMLElement;
  constructor(public app: any, public plugin: any) { this.containerEl = app.doc.createElement('div'); }
  display() {}
}
export class Modal {
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  constructor(public app: any) {
    this.containerEl = app.doc.createElement('div'); this.containerEl.className = 'preview-modal-backdrop';
    const modal = app.doc.createElement('section'); modal.className = 'preview-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', 'Gallery settings');
    this.containerEl.appendChild(modal);
    const close = app.doc.createElement('button'); close.textContent = 'Close'; close.className = 'preview-modal-close';
    close.setAttribute('aria-label', 'Close settings'); close.onclick = () => this.close(); modal.appendChild(close);
    this.titleEl = app.doc.createElement('h2'); modal.appendChild(this.titleEl);
    this.contentEl = app.doc.createElement('div'); modal.appendChild(this.contentEl);
    this.containerEl.addEventListener('click', event => { if (event.target === this.containerEl) this.close(); });
    this.containerEl.addEventListener('keydown', event => { if (event.key === 'Escape') this.close(); });
  }
  open() { this.app.doc.body.appendChild(this.containerEl); this.onOpen(); }
  close() { this.onClose(); this.containerEl.remove(); }
  onOpen() {}
  onClose() {}
}
export class Notice {
  constructor(message: string) {
    const toast = document.createElement('div');
    toast.className = 'preview-toast'; toast.textContent = message; toast.setAttribute('role', 'status');
    document.body.appendChild(toast); setTimeout(() => toast.remove(), 4500);
  }
}
export function setIcon(node: HTMLElement, name: string) {
  const key = name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const icon = (icons as Record<string, IconNode>)[key];
  if (icon) node.replaceChildren(createElement(icon));
}
