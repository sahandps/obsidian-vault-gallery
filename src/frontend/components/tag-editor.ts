// Copyright (C) 2026 Sahand (sahandps)
// SPDX-License-Identifier: GPL-3.0-only
import { parseTags } from '../../backend/data/metadata';

let editorId = 0;
export class TagEditor {
  readonly input: HTMLInputElement;
  private root: HTMLElement;
  private chips: HTMLElement;
  private suggestions: HTMLElement;
  private tags: string[];
  private options: string[] = [];
  private active = -1;
  private disabled = false;

  constructor(parent: HTMLElement, tags: readonly string[], private knownTags: () => string[], private onChange: () => void = () => {}, label = 'Tags') {
    this.tags = parseTags(tags.join(','));
    this.root = parent.createDiv({ cls: 'vg-tag-editor' });
    this.chips = this.root.createDiv({ cls: 'vg-tag-chips' });
    this.input = this.root.createEl('input', { type: 'text', placeholder: 'Add a tag…' });
    this.input.setAttribute('aria-label', label);
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('autocomplete', 'off');
    this.suggestions = this.root.createDiv({ cls: 'vg-tag-suggestions' });
    this.suggestions.id = `vg-tag-suggestions-${++editorId}`;
    this.suggestions.setAttribute('role', 'listbox');
    this.input.setAttribute('aria-controls', this.suggestions.id);
    this.closeSuggestions();
    this.input.addEventListener('input', () => {
      if (this.input.value.includes(',') || this.input.value.includes('\n')) this.commit();
      this.renderSuggestions(); this.onChange();
    });
    this.input.addEventListener('focus', () => this.renderSuggestions());
    this.input.addEventListener('blur', () => this.closeSuggestions());
    this.input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Enter' && this.active >= 0 && this.options[this.active]) {
          this.addTags([this.options[this.active]]); this.input.value = '';
        } else this.commit();
        this.closeSuggestions();
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.options.length) {
        event.preventDefault(); event.stopPropagation();
        this.active = (this.active + (event.key === 'ArrowDown' ? 1 : -1) + this.options.length) % this.options.length;
        this.highlight();
      } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); this.closeSuggestions();
      } else if (event.key === 'Backspace' && !this.input.value && this.tags.length) {
        this.tags.pop(); this.renderChips(); this.onChange();
      }
    });
    this.input.addEventListener('paste', event => {
      const value = event.clipboardData?.getData('text/plain');
      if (value && /[,\n]/.test(value)) {
        event.preventDefault(); this.addTags(parseTags(value.replace(/\n/g, ','))); this.closeSuggestions();
      }
    });
    this.renderChips();
  }

  getTags(): string[] { return parseTags([...this.tags, this.input.value].join(',')); }
  setTags(tags: readonly string[]): void { this.tags = parseTags(tags.join(',')); this.input.value = ''; this.renderChips(); this.closeSuggestions(); }
  addTags(tags: readonly string[]): void { this.tags = parseTags([...this.tags, ...tags].join(',')); this.renderChips(); this.onChange(); }
  setDisabled(disabled: boolean): void {
    this.disabled = disabled; this.input.disabled = disabled;
    for (const button of Array.from(this.chips.querySelectorAll('button'))) button.disabled = disabled;
    if (disabled) this.closeSuggestions();
  }
  private commit(): void { const value = this.input.value.replace(/\n/g, ','); this.input.value = ''; this.addTags(parseTags(value)); }
  private renderChips(): void {
    this.chips.replaceChildren();
    for (const tag of this.tags) {
      const chip = this.chips.createSpan({ cls: 'vg-tag-chip' });
      chip.createSpan({ text: `#${tag}` });
      const remove = chip.createEl('button', { text: '×' });
      remove.type = 'button'; remove.disabled = this.disabled;
      remove.setAttribute('aria-label', `Remove tag ${tag}`);
      remove.addEventListener('click', () => {
        this.tags = this.tags.filter(value => value !== tag); this.renderChips(); this.onChange(); this.input.focus();
      });
    }
  }
  private renderSuggestions(): void {
    const query = this.input.value.trim().replace(/^#+/, '').toLowerCase();
    this.options = [...new Set(this.knownTags())].filter(tag => !this.tags.includes(tag) && tag.toLowerCase().includes(query)).sort().slice(0, 8);
    this.active = -1;
    this.suggestions.replaceChildren();
    for (const [index, tag] of this.options.entries()) {
      const option = this.suggestions.createEl('button', { text: `#${tag}` });
      option.type = 'button'; option.id = `${this.suggestions.id}-${index}`;
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => {
        this.addTags([tag]); this.input.value = ''; this.closeSuggestions(); this.input.focus();
      });
    }
    this.suggestions.hidden = !this.options.length || this.disabled;
    this.input.setAttribute('aria-expanded', String(!this.suggestions.hidden));
    this.input.removeAttribute('aria-activedescendant');
  }
  private highlight(): void {
    for (const [index, option] of Array.from(this.suggestions.children).entries()) option.setAttribute('aria-selected', String(index === this.active));
    this.input.setAttribute('aria-activedescendant', `${this.suggestions.id}-${this.active}`);
  }
  private closeSuggestions(): void {
    this.options = []; this.active = -1; this.suggestions.hidden = true;
    this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant');
  }
}
