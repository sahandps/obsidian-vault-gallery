export class ItemView {
  app: any;
  contentEl: HTMLElement;
  constructor(public leaf: any) { this.app = leaf.app; this.contentEl = leaf.contentEl; }
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
}
export class Notice { constructor(public message: string) {} }
export class TFile {}
export function setIcon(node: HTMLElement, name: string) { node.setAttribute('data-icon', name); }
