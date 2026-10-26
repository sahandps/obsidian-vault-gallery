Media Hub 0.3.0 adds tag chips, multiple selection, and collections.

Requires Obsidian **1.7.2 or newer**. Licensed under **GNU GPL v3.0** (`GPL-3.0-only`). The plugin ID remains `vault-gallery`, preserving existing tags, descriptions, and settings.

Type a tag and press **Enter** or **comma** to create a chip, choose an existing-tag suggestion, or remove a chip with **×**. Click **Save details** to save inspector edits.

Check media cards, **Shift-click** to select a range, or use **Select all** to select every matching file. The selection toolbar offers **Add tags**, **Add to collection**, and **Delete files**. Create named collections from the sidebar or while adding files; a file can belong to several collections without moving or copying it.

Within a collection, **Remove from collection** leaves the original files and other memberships intact. **Delete files** shows the count and exact paths before using Obsidian’s configured trash handling. Files renamed or replaced after confirmation are skipped, and partial failures are reported.

Tags and collections remain local plugin metadata and do not appear in Obsidian’s native tag search.

[Buy me a coffee](https://buymeacoffee.com/sahandprs)

### Updates

- Tag chips with Enter/comma entry, removal, duplicate prevention, and existing-tag suggestions.
- Checkbox selection, Shift-click ranges, Select all, and bulk tags that preserve existing details.
- Named collections with multiple memberships and file/folder rename tracking.
- Separate collection removal and confirmed deletion through Obsidian’s trash API.
- Automated coverage for selection, chips, collection membership, cancellation, partial deletion failures, and save rollback.
