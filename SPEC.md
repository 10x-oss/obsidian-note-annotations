# Note Annotations Plugin Spec — AI Co-Reading Edition

This spec describes the target state of the `note-annotations` plugin, redesigned for AI-assisted reading. The primary use case: a human and an AI read long-form markdown documents (books, papers, essays) together in Obsidian. Either party can highlight passages, leave comments, ask questions, and build a shared understanding of the text — all stored inline in the markdown.

## Design Principles

1. **Markdown-native** — All annotation data lives in the document itself. No external databases, no sidecar files, no Obsidian-specific metadata stores. Any tool that can read/write markdown can participate.
2. **AI-operable** — An AI agent that can edit markdown files must be able to create, read, update, and delete any annotation without ambiguity. This means stable IDs, predictable formats, and no reliance on visual/interactive UI.
3. **Human-readable in source** — A human reading the raw markdown should be able to understand annotations without rendering. The syntax should be scannable, not cryptic.
4. **Backward-compatible** — Existing `==text==` and `==text==<!--comment-->` annotations must continue to render. New features are additive tokens within the same comment structure.
5. **Obsidian-idiomatic** — The plugin should feel native to Obsidian in both Live Preview and Reading View. Use standard Obsidian patterns (commands, settings, CSS classes) rather than inventing parallel systems.

---

## Annotation Format

### Grammar

Every annotation follows this structure:

```
==highlighted text==<!--#ID :type: comment body @color-->
```

All tokens inside `<!-- -->` are optional and order-sensitive. The full grammar:

```
ANNOTATION     := =={text}=={comment_block}?
comment_block  := <!--{tokens}-->
tokens         := {id}? {type}? {body}? {color}?
id             := #{hex4-6}
type           := :{typename}:
body           := free text (may contain [speaker] prefixed lines)
color          := @{colorname}
```

### Token Reference

| Token | Format | Required | Purpose |
|-------|--------|----------|---------|
| ID | `#a1f3` | Required for AI-created annotations. Optional for human-created. | Stable reference for programmatic access. |
| Type | `:insight:` | Optional | Semantic category of the annotation. |
| Body | free text | Optional | The annotation content — comments, questions, notes. |
| Color | `@yellow` | Optional | Visual color. Must be a known color name from the color catalog. |

### Format Examples

**Plain highlight (no annotation data):**
```md
==Some text==
```

**Human-created highlight with comment (backward-compatible, no ID):**
```md
==Some text==<!--My note-->
```

**AI-created highlight with full metadata:**
```md
==Some text==<!--#a1f3 :insight: This is the author's central thesis @gold-->
```

**AI-created highlight, type + color, no body:**
```md
==Some text==<!--#b2c4 :definition: @lightblue-->
```

**Highlight with color only (backward-compatible):**
```md
==Some text==<!--@yellow-->
```

**Highlight with ID only (AI bookmark, no comment):**
```md
==Some text==<!--#c3d5-->
```

### Annotation Types

The following types are built-in. The plugin must recognize all of them. Users and AI can use any type; the plugin renders appropriate icons/styles for each.

| Type | Meaning | Suggested Color |
|------|---------|----------------|
| `:insight:` | Key insight or important point | `gold` |
| `:question:` | Something to discuss or unclear | `lightsalmon` |
| `:definition:` | Term definition or explanation | `lightblue` |
| `:connection:` | Link to another idea, book, or concept | `violet` |
| `:summary:` | Condensed restatement of a passage | `lightgreen` |
| `:disagree:` | Disagreement or counterpoint | `lightcoral` |
| `:bookmark:` | Place marker, no commentary needed | `lightgray` |
| `:note:` | General note (default if type omitted but body present) | default highlight color |

The type list should be stored in a config constant, not hardcoded across the codebase. Adding a new type must be a one-line addition.

### Threaded Conversations

For back-and-forth discussion on a single annotation, the body supports speaker-prefixed lines:

```md
==The Cognitive Revolution==<!--#d4e6 :question:
[ai] Why does the author date this to 70,000 years ago rather than the anatomical emergence at 200,000?
[user] He argues the key change was behavioral, not anatomical — language and fiction.
[ai] That maps to the "Great Leap Forward" debate in paleoanthropology. Worth cross-referencing with ch. 2.
@lightsalmon-->
```

Rules:
- Each speaker turn starts with `[speaker]` where speaker is `ai` or `user` (or any other identifier).
- Turns are separated by newlines within the comment.
- The `@color` token is always last, after all turns.
- The plugin renders threaded comments in the popover and margin notes with visual turn separation.

### ID Generation

- IDs are 4-character lowercase hex strings (e.g., `#a1f3`). This gives 65,536 unique IDs per document, which is sufficient.
- AI generates IDs when creating annotations. The AI must check for collisions within the document before using an ID.
- Human-created annotations via the UI get an auto-generated ID assigned by the plugin at creation time.
- IDs are immutable once assigned. They do not change when the annotation is edited.

---

## Multi-Line Highlights

The current single-line constraint is removed. Highlights can span multiple lines using a block annotation syntax.

### Inline Multi-Line (for short spans across 2-3 lines)

```md
==This text spans
across two lines==<!--#e5f7 :insight: Important passage @gold-->
```

The `==` markers simply wrap the text, and the regex parser handles newlines within. The `<!--comment-->` must immediately follow the closing `==` on the same line as the closing marker.

### Block Annotations (for longer passages)

For passages spanning multiple paragraphs, use Obsidian-style comment blocks:

```md
%%ann-start #f6a8 :summary: @lightgreen%%
The Agricultural Revolution, which began about 12,000 years ago, was one of the most
controversial events in history. It made the lives of individual humans arguably worse,
while making the species as a whole more successful.

Hunter-gatherers spent their time in more stimulating and varied ways, and were less in
danger of starvation and disease.
%%ann-end #f6a8%%
The author's main argument is that agriculture was a trap — more food but worse quality of life per individual.
%%ann-close%%
```

Structure:
- `%%ann-start #ID :type: @color%%` opens the highlighted region. All metadata tokens go here.
- `%%ann-end #ID%%` closes the highlighted region. The ID is repeated for unambiguous matching.
- Everything between `ann-end` and `%%ann-close%%` is the comment body.
- `%%ann-close%%` terminates the entire block annotation.
- `%%` is already used by Obsidian for comments (hidden in preview), so this degrades gracefully in vanilla Obsidian — the markers are invisible, and the book text remains visible.

---

## Reading Progress Tracking

Each book file should have YAML frontmatter that tracks reading state:

```yaml
---
title: "Sapiens"
author: "Yuval Noah Harari"
reading_status: "in-progress"
current_section: "## Part Two: The Agricultural Revolution"
last_read: 2026-04-07
sessions:
  - date: 2026-04-05
    section: "## Part One: The Cognitive Revolution"
    annotations_added: 12
  - date: 2026-04-07
    section: "## Part Two: The Agricultural Revolution"
    annotations_added: 8
---
```

This frontmatter is managed by AI — the plugin reads it but does not write it unless the user triggers a "mark progress" command. The AI updates `current_section` and `last_read` when a reading session ends.

The `sessions` log gives both human and AI a history of what was read and how much annotation activity happened.

---

## Annotation Summary Blocks

AI can insert summary blocks at the end of sections or chapters. These are visible callouts that aggregate insights:

```md
> [!reading-notes] AI Reading Notes — Part One: The Cognitive Revolution
> **12 annotations** | 4 insights, 3 questions, 2 connections, 2 definitions, 1 summary
>
> **Key Insights:**
> - The Cognitive Revolution was behavioral, not anatomical (#a1f3)
> - Shared myths enable large-scale cooperation (#b2c4)
>
> **Open Questions:**
> - How does the "Great Leap Forward" debate resolve? (#d4e6)
>
> **Connections:**
> - Kahneman's System 1/System 2 maps to pre/post Cognitive Revolution (#c3d5)
```

Rules:
- Use Obsidian callout syntax (`> [!reading-notes]`) so it renders natively.
- Reference annotation IDs so the user can jump to the source.
- AI regenerates these when asked, not automatically on every annotation change.

---

## User-Facing Controls

### Commands

| Command | Behavior |
|---------|----------|
| `Highlight selection` | Wraps selection in `==text==`, assigns an ID, opens popover. |
| `Toggle highlight mode` | Toggles global highlighting mode on/off. |
| `Summarize annotations` | AI generates or updates the reading-notes callout for the current section. |
| `List all annotations` | Opens a modal showing all annotations in the current file, grouped by type, with jump-to-source. |
| `Remove all annotations` | Strips all annotation markup, restoring plain text. Requires confirmation. |

### Ribbon and Status Bar

- Ribbon icon toggles highlight mode. Icon changes appearance when mode is active.
- Status bar shows `Highlighting: ON` or `Highlighting: OFF` (not a raw boolean). Click toggles.

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Expand selection | Toggle | `true` | Auto-expand selection to word boundaries. |
| Color options | Comma-separated list | `gold, lightblue, lightgreen, lightsalmon, violet, lightcoral, lightgray` | Colors shown in the popover picker. Aligned with annotation type suggested colors. |
| Default annotation type | Dropdown | `:note:` | Type applied when creating a highlight without explicitly choosing one. |
| Auto-assign IDs | Toggle | `true` | Generate IDs for all new annotations, including manual ones. |
| Show margin notes | Toggle | `true` | Display margin notes in Reading View. |
| Thread display | `inline` / `collapsed` | `inline` | How threaded conversations render in the popover. |

Color options must apply at runtime without requiring a plugin reload. The editor extension must observe setting changes reactively.

---

## Highlight Creation

### Preconditions

- Non-empty selection required.
- For inline highlights: selection may span multiple lines but must not cross heading boundaries.
- Selected text must not already contain `==` markers.
- Selected text must not already be inside a `%%ann-start%%...%%ann-close%%` block.

### Selection Expansion

When `expandSelection` is enabled:
- Expand outward to word boundaries.
- Do not cross existing `==` boundaries or `%%ann-` boundaries.
- Trim leading/trailing whitespace.
- If selection spans multiple lines, only expand the first and last line boundaries (not intermediate lines).

### Insert Behavior

1. Plugin wraps selected text: `==selected text==`
2. Plugin generates a 4-char hex ID.
3. Plugin inserts comment block: `<!--#xxxx-->`
4. Plugin dispatches effect to open popover on the new annotation.
5. User can then add type, comment, and color via the popover.

For block annotations (selection spanning more than 3 lines or multiple paragraphs):
1. Plugin wraps with `%%ann-start #xxxx%%` ... `%%ann-end #xxxx%%` ... `%%ann-close%%`
2. Comment body area between `ann-end` and `ann-close` starts empty.
3. Popover opens for the block annotation.

### Modifier Key Behavior

| Mode | Modifier | Behavior |
|------|----------|----------|
| Highlight mode OFF | `Cmd` (Mac) / `Ctrl` (Win) + select | Creates highlight |
| Highlight mode OFF | `Alt` + select | Creates highlight (bypasses expand-selection) |
| Highlight mode ON | Select (no modifier) | Creates highlight |
| Highlight mode ON | `Alt` + select | Creates highlight (bypasses expand-selection) |

The implementation must check `metaKey` on Mac and `ctrlKey` on Windows/Linux, not just `metaKey` everywhere.

---

## Live Preview Rendering

### Decoration Strategy

- Scan the full editor document for both inline and block annotation syntax.
- Replace matched ranges with `Decoration.replace` widgets.
- Widgets render styled `<span>` elements for inline annotations.
- Block annotations render with a left-border highlight bar and collapsed metadata header.

### Regex Patterns

The editor layer must parse:

1. **Annotated inline highlight:** `==(.+?)==<!--([\s\S]*?)-->`
2. **Plain inline highlight:** `==([^=]+)==` (not followed by `<!--`)
3. **Block annotation open:** `%%ann-start\s+(#[a-f0-9]{4,6})(?:\s+:[a-z]+:)?(?:\s+@\w+)?%%`
4. **Block annotation close:** `%%ann-close%%`
5. **Block annotation end marker:** `%%ann-end\s+#[a-f0-9]{4,6}%%`

The inline highlight regex must support multi-line content (note: `(.+?)` with dotall flag, or `([\s\S]+?)`).

### Widget Behavior

Each highlight widget:
- Renders the highlighted text with appropriate background color.
- Shows `.has-comment` dashed underline when a non-empty body exists.
- Shows a type icon badge (small, inline) when a type token is present.
- Applies `backgroundColor` from the `@color` token if present.
- On click: opens the comment popover.
- On hover: shows tooltip with the comment body (first line only if threaded).

### Popover Behavior

The popover is the primary editing interface for annotations.

**Layout:**

```
+------------------------------------------+
| [Remove]              [Copy] [Extract] [X]|
+------------------------------------------+
| Type: [insight v]  Color: [O O O O O O]  |
+------------------------------------------+
| Comment:                                  |
| [textarea]                                |
|                                           |
+------------------------------------------+
| Thread: (if threaded)                     |
| [ai] First message                       |
| [user] Reply                             |
| [New reply textarea]                      |
+------------------------------------------+
| ID: #a1f3 (read-only, small, muted)      |
+------------------------------------------+
```

**Actions:**
- **Remove**: strips all annotation markup, restores plain text.
- **Copy**: copies highlighted text to clipboard.
- **Extract**: creates a new note from the highlighted text (see Extract behavior below).
- **Type picker**: dropdown of annotation types. Changing type updates the `:type:` token in source.
- **Color picker**: row of color circles. Clicking one updates the `@color` token in source.
- **Comment textarea**: edit the annotation body. Enter saves, Shift+Enter for newline.
- **Thread view**: if `[speaker]` lines exist, render them as a conversation. New reply appends a `[user]` turn.
- **ID display**: shown as small muted text at the bottom. Not editable.

**Save semantics:**
- Empty body + no type + no color = plain `==text==` (strip comment block entirely).
- Any non-empty token = `==text==<!--{tokens}-->`.
- ID is always preserved if it was present.
- Color token is always last in the comment string.

**Validation:**
- Comment body must not contain `-->`.
- Comment body must not contain `%%ann-` (to prevent parser confusion).
- These are enforced in the textarea with inline validation, not silent rejection.

### Extract-to-File Behavior

When extracting a highlight to a new file:
- Filename: sanitize highlighted text, truncate to 60 chars, append `.md`.
- File content:

```md
---
source: "[[Original File Name]]"
annotation_id: "#a1f3"
type: "insight"
---

> {highlighted text}

{annotation body, if any}
```

- Open the new file after creation.

---

## Reading View Rendering

### Processing Flow

1. Postprocessor finds rendered `<mark>` elements in preview sections.
2. For each `<mark>`, look up the source markdown for the corresponding section.
3. Match `<mark>` nodes to parsed annotations. **Matching strategy:**
   - Primary: match by annotation ID if present in the source.
   - Fallback: match by visible text content (current behavior, for legacy annotations without IDs).
   - If multiple text matches exist and no ID disambiguates, match in document order.
4. Apply decoration and create margin notes.

### Reading View Output

For each matched annotation:
- Apply `background-color` from `@color` token.
- Add `.has-comment` class if body is non-empty.
- Add `data-annotation-id` attribute with the `#ID` value.
- Add `data-annotation-type` attribute with the `:type:` value.
- Set `title` to the comment body (first turn only if threaded).
- If body is non-empty: create a margin note beside the section.

### Margin Notes

- Alternate left/right positioning using a counter (current behavior).
- Margin note content:
  - Type icon (if typed).
  - Comment body (full text, or collapsed with expand toggle if > 3 lines).
  - If threaded: show conversation turns with speaker labels.
- Hover behavior:
  - Hovering the `<mark>` highlights the corresponding margin note.
  - Hovering the margin note adds `.hover` to the `<mark>`.

### Block Annotation Rendering in Reading View

- The highlighted passage renders with a colored left border (4px solid, annotation color).
- The comment body renders as a margin note or inline callout below the passage.
- `%%` markers are already hidden by Obsidian in Reading View, so the block delimiters are naturally invisible.

---

## Color System

### Color Resolution

1. Parse the `@word` token from the end of the comment block.
2. Look up in the built-in color catalog (the existing `colors.ts` list).
3. If found: use the named color's hex value.
4. If not found: ignore the token, use default highlight color.

### Settings Interaction

- User settings control which colors appear in the popover picker.
- The parser still accepts any color in the built-in catalog, regardless of settings.
- Settings changes must apply immediately to the popover without reload. This means the editor extension must subscribe to settings changes reactively (not just read at load time).

---

## AI Integration Contract

This section defines the contract for how an external AI agent interacts with annotations. The AI operates by reading and writing the markdown file directly — it does not use the Obsidian plugin API.

### AI Capabilities

The AI must be able to:

1. **Create an annotation**: Insert `==text==<!--#ID :type: body @color-->` at the correct position in the file.
2. **Read annotations**: Parse all annotations from the file, extracting ID, type, body, color, and the highlighted text.
3. **Update an annotation**: Find an annotation by `#ID` and modify its type, body, or color without changing the highlighted text or ID.
4. **Delete an annotation**: Find an annotation by `#ID` and strip the markup, restoring the original text.
5. **Thread a reply**: Find an annotation by `#ID` and append a `[ai]` turn to the body.
6. **Create block annotations**: Wrap multi-paragraph passages with `%%ann-start%%`...`%%ann-close%%` syntax.
7. **Generate summary callouts**: Insert or update `> [!reading-notes]` blocks.
8. **Update frontmatter**: Modify reading progress fields.

### AI Annotation Patterns

When the AI reads along with the user, it should use annotations for:

| Pattern | Type | Example |
|---------|------|---------|
| Flagging a key argument | `:insight:` | "This is the thesis of the chapter" |
| Asking the user to reflect | `:question:` | "Do you agree with this claim?" |
| Defining a term the author uses | `:definition:` | "Cognitive dissonance: holding contradictory beliefs simultaneously" |
| Linking to another book or concept | `:connection:` | "Compare with Kahneman's System 1 in Thinking Fast and Slow" |
| Summarizing a dense paragraph | `:summary:` | "In short: agriculture traded quality of life for population growth" |
| Pushing back on the author | `:disagree:` | "This claim is contested — see counter-evidence in..." |
| Marking a place to return to | `:bookmark:` | (no body needed) |

### File Mutation Rules for AI

- Always generate a unique `#ID` for new annotations. Check existing IDs in the file first.
- Never modify text outside of annotation markup unless explicitly asked.
- When updating an annotation, preserve the exact highlighted text — change only the comment block.
- When deleting, restore the original text exactly (no extra whitespace, no missing characters).
- When inserting block annotations, ensure `%%ann-start%%` is on its own line before the passage, and `%%ann-close%%` is on its own line after the comment.
- Never insert annotations inside code blocks, YAML frontmatter, or other `%%` comment blocks.

---

## CSS and Presentation

### Class Hierarchy

```
.omnidian-highlight                   — base class for all highlights
  .has-comment                        — has a non-empty body
  .has-color                          — has a @color token
  .type-insight                       — type-specific styling
  .type-question
  .type-definition
  .type-connection
  .type-summary
  .type-disagree
  .type-bookmark
  .type-note

.omnidian-comment                     — margin note container
  .omnidian-comment-thread            — threaded conversation in margin note
    .omnidian-comment-turn            — individual turn
    .omnidian-comment-turn-ai         — AI speaker turn
    .omnidian-comment-turn-user       — User speaker turn

.omnidian-block-annotation            — block annotation wrapper
  .omnidian-block-highlight           — the highlighted passage region
  .omnidian-block-comment             — the comment body region

#omnidian-comment-popover-container   — popover root
  .omnidian-comment-popover           — popover content
```

### Live Preview Styles

```css
.is-live-preview .omnidian-highlight {
  background-color: var(--text-highlight-bg);
  cursor: pointer;
  display: inline;
  user-select: none;
}
.is-live-preview .omnidian-highlight.has-comment {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.is-live-preview .omnidian-highlight:hover {
  filter: saturate(1.5);
  text-decoration-style: solid;
}
```

### Reading View Styles

```css
.markdown-reading-view .omnidian-highlight.hover {
  filter: saturate(1.5);
  text-decoration: underline dashed 1px;
  text-underline-offset: 3px;
}
.markdown-reading-view .omnidian-highlight:hover {
  cursor: help;
}
```

### Type-Specific Styles

Each type gets a subtle left-border or icon indicator. The implementation should use CSS custom properties so theme authors can override:

```css
.omnidian-highlight.type-question {
  border-bottom: 2px dotted var(--text-warning);
}
.omnidian-highlight.type-disagree {
  border-bottom: 2px solid var(--text-error);
}
```

---

## Architecture

### File Structure

```
src/
  main.ts              — plugin lifecycle, commands, event handlers, settings wiring
  settings.ts          — settings tab UI, reactive settings store
  types.ts             — shared types: Annotation, AnnotationType, AnnotationID, etc.
  colors.ts            — color catalog (unchanged)
  lib/
    utils.ts           — cn(), matchColor()
    parser.ts          — annotation parsing: extractAnnotations(), parseComment(), generateID()
    serializer.ts      — annotation serialization: serializeAnnotation(), serializeBlockAnnotation()
  editor/
    extension.tsx      — CodeMirror decorations, widget rendering
    popover.tsx         — popover UI component
    commands.ts         — highlight creation, selection expansion
  preview/
    postprocessor.tsx   — Reading View mark matching, margin note creation
    note.tsx            — margin note React component
    block.tsx           — block annotation React component
  styles.css           — all CSS
```

### Key Architectural Changes from Current State

1. **Centralized parser** (`lib/parser.ts`): Both the editor layer and preview layer must use the same parsing logic. Currently they have separate regex implementations that can diverge. The parser module exports a single `extractAnnotations(text: string): Annotation[]` function used everywhere.

2. **Centralized serializer** (`lib/serializer.ts`): All annotation-to-string conversion goes through one module. This ensures the AI and the plugin always produce identical output for the same logical annotation.

3. **Shared types** (`types.ts`): The `Annotation` type is the canonical data model:

```typescript
interface Annotation {
  id: string | null;          // "#a1f3" or null for legacy
  type: AnnotationType | null;
  body: string;               // comment text (without type/color tokens)
  color: string | null;       // color name or null
  highlightText: string;      // the text between == markers
  threads: Thread[];          // parsed [speaker] turns, if any
  from: number;               // character offset in document
  to: number;                 // character offset in document
  isBlock: boolean;           // true if %%ann-start%% style
}

interface Thread {
  speaker: string;   // "ai", "user", or custom
  message: string;
}

type AnnotationType =
  | "insight"
  | "question"
  | "definition"
  | "connection"
  | "summary"
  | "disagree"
  | "bookmark"
  | "note";
```

4. **Reactive settings**: The editor extension must consume settings via a `StateField` or `Facet` that updates when settings change, not just at load time.

5. **ID-based matching in Reading View**: The postprocessor uses `data-annotation-id` attributes for matching, falling back to text matching only for legacy annotations.

---

## Migration

Existing annotations in the old format must continue to work:

| Old Format | Treated As |
|------------|------------|
| `==text==` | Plain highlight, no ID, no type |
| `==text==<!--comment-->` | Annotated highlight, no ID, type `:note:`, body = comment |
| `==text==<!--comment @color-->` | Annotated highlight, no ID, type `:note:`, body = comment, color = color |
| `==text==<!--@color-->` | Colored highlight, no ID, no body |

When a user edits a legacy annotation via the popover, the plugin should:
1. Generate and assign an ID.
2. Preserve the existing comment and color.
3. Save in the new format.

This is a lazy migration — annotations are upgraded on edit, not on file open.

---

## Limitations and Constraints

- **No cross-file annotations**: Annotations exist within a single file. Cross-referencing is done via wikilinks in the annotation body, not via a global annotation index.
- **No real-time sync**: The AI and the human do not co-edit simultaneously. The AI writes to the file, the human sees it on next read (Obsidian hot-reloads file changes). Turn-taking is sequential.
- **HTML comment constraints**: Comment bodies still cannot contain `-->`. This is a hard limitation of the storage format. The plugin must validate and reject.
- **Block annotation nesting**: Block annotations cannot be nested. A `%%ann-start%%` inside another block annotation is a parse error.
- **Performance**: For very long documents (5000+ lines), the full-document regex scan on every edit may become slow. The implementation should consider incremental parsing or debounced scanning for large files.
