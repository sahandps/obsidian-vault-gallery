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
    prototype.createDiv = function(options = {}) { return this.createEl('div', options); };
    prototype.createSpan = function(options = {}) { return this.createEl('span', options); };
    prototype.setCssProps = function(this: HTMLElement, props: Record<string, string>) {
      for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value);
    };
  }
  registerDomEvent(element: HTMLElement, type: string, callback: EventListener) { element.addEventListener(type, callback); }
}
export class Plugin {
  app: any;
  stored: any = null;
  saved: any[] = [];
  factory: any;
  async loadData() { return this.stored; }
  async saveData(data: any) { this.saved.push(data); this.stored = data; }
  registerView(_type: string, factory: any) { this.factory = factory; }
  registerEvent(_event: any) {}
  addRibbonIcon() {}
  addCommand() {}
  addSettingTab(tab: any) { this.settingsTab = tab; }
  settingsTab: any;
}
export class Notice { constructor(public message: string) {} }
export class TFile {}
export class TFolder { constructor(public path: string) {} }
export class PluginSettingTab {
  containerEl: HTMLElement;
  constructor(public app: any, public plugin: any) { this.containerEl = app.doc.createElement('div'); }
  display() {}
}
export class Modal {
  modalEl: HTMLElement;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  constructor(public app: any) {
    this.containerEl = app.doc.createElement('div'); this.containerEl.className = 'preview-modal-backdrop';
    const modal = app.doc.createElement('section'); modal.className = 'preview-modal'; this.modalEl = modal;
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', 'Gallery settings');
    this.containerEl.appendChild(modal);
    const close = app.doc.createElement('button'); close.textContent = 'Close'; close.className = 'preview-modal-close';
    close.setAttribute('aria-label', 'Close dialog'); close.onclick = () => this.close(); modal.appendChild(close);
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
export function setIcon(node: HTMLElement, name: string) { node.setAttribute('data-icon', name); }

export const Platform = { isAndroidApp: false };
export class CapacitorAdapter { getFullPath(path: string): string { return `/vault/${path}`; } }
