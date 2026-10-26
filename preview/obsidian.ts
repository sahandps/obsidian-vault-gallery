import { createElement, icons } from 'lucide';
import type { IconNode } from 'lucide';
export class ItemView {
  app: any;
  contentEl: HTMLElement;
  constructor(public leaf: any) { this.app = leaf.app; this.contentEl = leaf.contentEl; }
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
}
export class TFile {}
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
