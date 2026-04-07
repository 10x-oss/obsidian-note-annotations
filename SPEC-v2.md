# Note Annotations Plugin Spec v2

This document is a tightened implementation spec for the redesigned `note-annotations` plugin. It keeps the overall AI co-reading vision from [`SPEC.md`](/Users/10x/dev/projects/oss/obsidian-note-annotations/SPEC.md) while resolving the parts that were ambiguous, contradictory, or too risky to build against directly.

## Product Goal

The plugin turns Obsidian markdown into an annotation surface that works for both:

- humans reading and annotating inside Obsidian
- external AI agents that can read and write markdown files directly

The plugin's core responsibility is annotation rendering, editing, parsing, and migration.

The plugin is not responsible for bundling an LLM provider, running AI inference, or managing reading workflows outside the annotation system itself.

## Scope Boundary

### In Scope

- Inline highlights with stable annotation metadata
- Block annotations for multi-paragraph passages
- Popover editing UI
- Reading View rendering
- Live Preview rendering
- Annotation parsing and serialization
- Migration from legacy highlight/comment format
- Commands for creating, listing, and removing annotations

### Out of Scope

- Built-in AI provider integration
- Automatic summary generation by the plugin itself
- Automatic reading-progress frontmatter updates
- Cross-file annotation indexes
- Real-time collaborative merge logic

AI-generated summaries, reading logs, and frontmatter updates are supported as file conventions that an external AI may write, but they are not required for the plugin to function.

## Design Principles

1. Markdown-native: all annotation state lives in the note body.
2. AI-operable: external tools must be able to parse and mutate annotations deterministically.
3. Human-readable in source: annotation markup should remain understandable in raw markdown.
4. Backward-compatible: legacy `==text==` and `==text==<!--comment-->` forms must keep working.
5. Obsidian-first: the UX should feel native in Live Preview and Reading View.
6. Parser-first: editor and preview must share one annotation model.

## Canonical Annotation Model

Every parsed annotation resolves to this logical shape:

```ts
interface Annotation {
  id: string | null;
  kind: "inline" | "block";
  type: AnnotationType | null;
  body: string;
  color: string | null;
  highlightText: string;
  threads: Thread[];
  from: number;
  to: number;
}

interface Thread {
  speaker: string;
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

### Important Rules

- `id` is the stable identifier for annotation mutation.
- `body` is the canonical raw comment body without the type or color tokens.
- `threads` is derived from `body`, not stored separately.
- `from` and `to` always refer to source-document character offsets of the full annotation markup.

## ID Policy

This spec standardizes the ID story:

- Every new annotation created by the plugin gets an ID.
- Every new annotation created by AI should include an ID.
- Legacy annotations may remain ID-less until edited.
- Editing a legacy annotation triggers lazy migration and assigns an ID.
- IDs are immutable once assigned.

### ID Format

- Lowercase hex
- 4 characters by default, upgradeable to 6 if a collision occurs
- Stored with leading `#`, for example `#a1f3`

## Supported Syntax

## 1. Inline Annotation

### Plain highlight

```md
==Some text==
```

### Annotated highlight

```md
==Some text==<!--#a1f3 :insight: This is important @gold-->
```

### Legacy comment

```md
==Some text==<!--My note-->
```

### Legacy color-only

```md
==Some text==<!--@yellow-->
```

### Inline Grammar

```text
==highlighted text==<!--#ID :type: body @color-->
```

Within the HTML comment:

- `#ID` is optional only for legacy content
- `:type:` is optional
- `body` is optional
- `@color` is optional
- `@color` must be the last token when present

## 2. Block Annotation

Block annotations are the only supported multi-paragraph form in v2.

Inline highlights remain single-line in v2.

### Syntax

```md
%%ann-start #f6a8 :summary: @lightgreen%%
The Agricultural Revolution, which began about 12,000 years ago, was one of the most
controversial events in history.

Hunter-gatherers spent their time in more stimulating and varied ways.
%%ann-end #f6a8%%
The author's main argument is that agriculture was a trap.
%%ann-close%%
```

### Ownership Rules

- `%%ann-start ...%%` opens the annotation and stores ID, type, and color metadata.
- Text between `ann-start` and `ann-end` is the highlighted passage.
- Text between `ann-end` and `ann-close` is the annotation body.
- `%%ann-close%%` terminates the annotation.

### Mutation Rules

- Updating a block annotation may modify the metadata lines and the annotation body.
- Updating a block annotation must not mutate the highlighted passage unless explicitly requested.
- Removing a block annotation restores only the highlighted passage text and removes the metadata and body wrappers.

### Nesting

- Block annotations may not nest.
- Inline annotations may not be created inside block annotations.

## Annotation Types

The built-in types are:

| Type | Meaning | Suggested Color |
|------|---------|----------------|
| `:insight:` | Key insight or important point | `gold` |
| `:question:` | Open question or discussion prompt | `lightsalmon` |
| `:definition:` | Definition or explanation | `lightblue` |
| `:connection:` | Link to another idea or source | `violet` |
| `:summary:` | Condensed restatement | `lightgreen` |
| `:disagree:` | Counterpoint or disagreement | `lightcoral` |
| `:bookmark:` | Marker with little or no body | `lightgray` |
| `:note:` | Generic annotation | default highlight color |

The type registry must live in one config module and drive:

- parser validation
- type picker options
- icon mapping
- CSS class names

## Threaded Comments

Threaded comments are supported inside `body`.

Example:

```md
==The Cognitive Revolution==<!--#d4e6 :question:
[ai] Why 70,000 years ago rather than 200,000?
[user] Because the author is talking about behavior, not anatomy.
[ai] Worth cross-referencing with the Great Leap Forward debate.
@lightsalmon-->
```

### Rules

- A thread turn starts with `[speaker] ` at the beginning of a line.
- If no speaker-prefixed lines exist, the body is treated as plain comment text.
- `@color` remains the last token in the serialized payload.
- Thread rendering is a UI concern; source storage remains plain text.

## Commands

These are the plugin commands in v2:

| Command | Behavior |
|---------|----------|
| `Highlight selection` | Creates an inline annotation with generated ID and opens the popover. |
| `Create block annotation` | Wraps the selected passage as a block annotation and opens the popover. |
| `Toggle highlight mode` | Toggles highlight mode. |
| `List annotations in current file` | Opens a modal grouped by type with jump-to-source. |
| `Remove all annotations in current file` | Removes inline and block annotation markup after confirmation. |

### Explicitly Not Plugin Commands

The following are not core plugin commands in v2:

- `Summarize annotations`
- `Update reading progress`
- `AI reply`

Those belong to external AI/file workflows, not the base plugin.

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Expand selection | Toggle | `true` | Expand to word boundaries when creating inline highlights. |
| Color options | Comma-separated list | `gold, lightblue, lightgreen, lightsalmon, violet, lightcoral, lightgray` | Colors shown in the picker. |
| Default annotation type | Dropdown | `note` | Type used when no explicit type is selected. |
| Auto-assign IDs | Toggle | `true` | Assign IDs to all newly created annotations. |
| Show margin notes | Toggle | `true` | Enable Reading View margin note rendering. |
| Thread display | `inline` / `collapsed` | `inline` | Default thread presentation. |

### Runtime Behavior

Settings changes must apply without plugin reload.

That means the editor and preview layers must consume a reactive settings source rather than only reading settings during `onload()`.

## Highlight Creation Rules

## Inline Highlight Preconditions

- Selection must be non-empty.
- Selection must stay on a single line in v2.
- Selection must not already contain `==`.
- Selection must not be inside an existing block annotation.
- Selection must not cross code block boundaries or frontmatter.

### Why single-line inline in v2

The earlier spec assumed multi-line inline `==...==` could be made reliable with regex alone. That is not strong enough as a product guarantee. Until verified end-to-end in Obsidian rendering, inline annotations remain single-line and block annotations cover the multi-line case.

## Block Annotation Preconditions

- Selection must be non-empty.
- Selection may span multiple lines and paragraphs.
- Selection must not contain another block annotation.
- Selection must not start in frontmatter, code fences, or Obsidian comment regions unrelated to this feature.

## Modifier Key Behavior

| Mode | Modifier | Behavior |
|------|----------|----------|
| Highlight mode OFF | `Cmd` on macOS / `Ctrl` on Windows/Linux | Create inline highlight |
| Highlight mode OFF | `Alt` | Create inline highlight without selection expansion |
| Highlight mode ON | none | Create inline highlight |
| Highlight mode ON | `Alt` | Create inline highlight without selection expansion |

Implementation must use platform-aware key detection.

## Serialization Rules

All source writes must go through a shared serializer.

### Inline serialization

- Plain highlight with no metadata serializes as `==text==`
- Annotated highlight serializes as `==text==<!--tokens-->`
- If an ID exists, it is serialized first
- If a type exists, it follows the ID
- Body comes next
- Color comes last

### Block serialization

- Open line: `%%ann-start #ID :type: @color%%`
- Highlight passage
- End line: `%%ann-end #ID%%`
- Body
- Close line: `%%ann-close%%`

## Validation Rules

### Inline/comment validation

- Body must not contain `-->`
- Body must not contain `%%ann-`
- Type must be from the type registry
- Color must resolve from the built-in color catalog

### Block validation

- `ann-start` and `ann-end` IDs must match
- Block annotations may not nest
- `ann-close` must be present

Validation should produce user-facing errors in the editor UI and parser-facing diagnostics in code.

## Live Preview Rendering

The editor layer must not maintain its own ad hoc regex logic separate from preview.

### Required Architecture

- `lib/parser.ts` produces parsed annotations from markdown text
- `lib/serializer.ts` turns annotation objects back into markdown
- `editor/extension.tsx` consumes parser output and renders widgets

### Inline widget behavior

- Render highlighted text
- Add `.has-comment` when body is non-empty
- Add `.has-color` when color exists
- Add `.type-{name}` when type exists
- Open popover on click
- Show tooltip from first visible body line

### Block widget behavior

- Render a styled block wrapper
- Show a metadata header with type and ID
- Preserve clear selection affordances
- Open popover on click from the block chrome or comment region

## Popover Behavior

The popover is the primary annotation editor.

### Editable fields

- Type
- Color
- Body

### Read-only field

- ID

### Actions

- Remove annotation
- Copy highlighted text
- Extract annotation to new note

### Save semantics

- If the annotation was legacy and had no ID, save assigns one
- Empty body, empty type, empty color on an inline annotation collapses to plain `==text==`
- Existing IDs are always preserved
- Color is always serialized last

### Thread behavior

- If the current body parses as thread lines, show thread UI
- New replies append a new speaker-prefixed line
- If the current body is plain text, preserve it as plain text unless the user explicitly converts it into a thread

## Reading View Rendering

## Matching Strategy

This is the tightened rule set for Reading View matching:

1. Parse the source section with the shared parser.
2. Traverse rendered `<mark>` nodes in section order.
3. Match parsed inline annotations to marks by source order.
4. Use ID as the stable identity after the match is established.
5. Fall back to text comparison only for legacy ambiguity handling.

Important: ID is not used as the initial DOM lookup key because rendered marks do not inherently contain source IDs before plugin processing.

## Reading View output

For inline annotations:

- add `.omnidian-highlight`
- add `.has-comment`, `.has-color`, and `.type-*` classes as needed
- set `data-annotation-id` when an ID exists
- render margin note only when body is non-empty and margin notes are enabled

For block annotations:

- render a block wrapper with visible highlight treatment
- render the body as either a side note or inline note region

## Margin Notes

- Alternate left/right by section-local order
- Show type icon if present
- Show body text or thread turns
- Hovering mark and note should keep the current linked-hover behavior

## Color System

### Parsing

- The parser accepts any color in the built-in catalog
- The UI picker shows only colors enabled in settings

### Application

- If color token resolves, use it
- If not, fall back to the default highlight color

## Extraction to New File

When extracting an annotation:

- sanitize filename
- truncate to 60 characters
- include source note reference
- include annotation ID when present
- include type when present

Suggested file shape:

```md
---
source: "[[Original File Name]]"
annotation_id: "#a1f3"
type: "insight"
---

> Highlighted passage

Annotation body
```

## Migration

Legacy content must continue to parse:

| Old Format | New Logical Meaning |
|------------|---------------------|
| `==text==` | plain highlight |
| `==text==<!--comment-->` | note annotation with no ID |
| `==text==<!--comment @color-->` | note annotation with no ID and color |
| `==text==<!--@color-->` | color-only annotation with no body |

### Lazy migration

When a legacy annotation is edited:

1. assign a new ID
2. preserve body and color
3. serialize into the canonical v2 format

No mass rewrite occurs on file open.

## AI Integration Contract

External AI agents interact with the markdown file directly.

### AI may

- create annotations
- update annotations by ID
- delete annotations by ID
- append thread replies
- insert summary callouts
- update reading-related frontmatter if the user wants that workflow

### AI may not assume

- plugin APIs exist
- Obsidian commands are available
- the plugin writes summaries or frontmatter automatically

### AI mutation rule

AI should mutate only:

- inline comment blocks
- block annotation metadata lines
- block annotation body regions
- explicitly requested note content outside annotations

For block annotations, the body region between `ann-end` and `ann-close` is considered annotation-owned content.

## Performance

The current plugin reparses aggressively. v2 should begin with full-document parsing through a shared parser, but structure the code so incremental parsing can be introduced later if large-file performance becomes a problem.

## Implementation Plan

Build order should be:

1. shared types
2. shared parser
3. shared serializer
4. legacy migration helpers
5. inline annotation rendering with IDs and types
6. popover rewrite
7. Reading View matching rewrite
8. block annotation support
9. list/remove-all commands

This keeps the redesign grounded while avoiding a risky full rewrite in one jump.
