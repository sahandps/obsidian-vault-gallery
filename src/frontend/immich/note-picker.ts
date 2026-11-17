// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { FuzzySuggestModal, MarkdownView, Notice, type App, type TFile } from 'obsidian';

export class ImmichNotePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly markdown: string) {
    super(app);
    this.setPlaceholder('Insert Immich media into a note…');
    this.emptyStateText = 'No Markdown notes found';
  }

  getItems(): TFile[] {
    const recent = this.app.workspace.getLastOpenFiles();
    const rank = new Map(recent.map((path, index) => [path, index]));
    return this.app.vault.getMarkdownFiles().sort((a, b) =>
      (rank.get(a.path) ?? Infinity) - (rank.get(b.path) ?? Infinity) || a.path.localeCompare(b.path));
  }

  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { void this.insert(file); }

  private async insert(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType('markdown').find(item => item.view instanceof MarkdownView && item.view.file === file);
    try {
      if (leaf && leaf.view instanceof MarkdownView) {
        const editor = leaf.view.editor;
        // Insert on its own line without replacing selected note content.
        const cursor = editor.getCursor('to');
        editor.replaceRange('\n\n' + this.markdown + '\n\n', cursor);
      } else {
        await this.app.vault.process(file, content => {
          const separator = !content || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
          return content + separator + this.markdown + '\n';
        });
      }
    } catch { new Notice('Could not insert Immich references.'); return; }
    try {
      if (leaf) await this.app.workspace.revealLeaf(leaf);
      else await this.app.workspace.getLeaf('tab').openFile(file);
      new Notice('Added Immich references to ' + file.name + '.');
    } catch { new Notice('Added Immich references, but could not open ' + file.name + '.'); }
  }
}
