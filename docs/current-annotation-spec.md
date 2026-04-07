# Note Annotations Current-State Spec

This document describes how the current `note-annotations` plugin works today, based on the code in this repository rather than the marketing description alone.

## Goal

The plugin adds lightweight inline annotations to Obsidian notes by combining:

- markdown highlights using `==highlighted text==`
- optional HTML comments immediately after the highlight using `<!--comment-->`
- an optional inline color token inside the comment using `@colorName`

The implementation has two separate presentation layers:

- Live Preview editor behavior in CodeMirror
- Reading View behavior through a markdown postprocessor

## Annotation Storage Format

Annotations are stored directly in the note body. There is no external index, block metadata store, or per-annotation ID.

### Plain highlight

```md
==Some text==
```

### Highlight with comment

```md
==Some text==<!--My note-->
```

### Highlight with comment and color

```md
==Some text==<!--My note @yellow-->
```

### Highlight with color only

```md
==Some text==<!--@yellow-->
```

In that last form, the code treats the annotation as colorized but not commented.

## User-Facing Controls

### Commands

- `Highlight selection`
- `Toggle highlight mode`

### Ribbon and status bar

- A ribbon icon toggles highlight mode.
- A status bar item shows `Highlighting mode: true|false` and also toggles the mode when clicked.

### Settings

- `Expand selection`
- `Highlighting color options`

`Highlighting color options` is stored as a comma-separated list of color names, but the editor extension only receives the list at plugin load time, so changing it effectively requires reload to fully apply.

## Highlight Creation Rules

Highlight creation starts in [`src/editor/commands.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/commands.ts).

### Preconditions

- There must be a non-empty selection.
- The selection must be on a single line.
- The selected text must not already contain `==`.

If any of those checks fail, the command either returns `false` or shows a notice.

### Selection expansion

If `expandSelection` is enabled, the plugin:

- expands outward to word boundaries
- avoids crossing existing `==` boundaries
- trims leading and trailing whitespace

This exists to reduce broken markdown rendering from awkward partial-word selections.

### Insert behavior

The selected text is rewritten as:

```md
==selected text==
```

Immediately after insertion, the plugin dispatches an effect so the new highlight opens the comment popover.

## Highlighting Mode Behavior

The global event handlers live in [`src/main.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/main.ts).

### When highlight mode is off

- Mouse/touch selection does nothing unless a modifier key is held.
- The code currently checks `metaKey` or `altKey`.

### When highlight mode is on

- Mouse/touch selection in Live Preview automatically creates a highlight on `mouseup` or `touchend`.
- `mousedown` and `touchstart` in Live Preview are prevented so normal editor interaction is partially locked.

### Important implementation note

The code does not currently check `ctrlKey`, even though the README describes Command on Mac and Control on Windows. Current behavior is therefore implementation-specific and not fully aligned with the README.

## Live Preview Rendering Model

The editor implementation lives in [`src/editor/extension.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/extension.tsx).

### Decoration strategy

- In Live Preview only, the plugin scans the whole editor document for highlight syntax.
- Matching highlight source text is replaced by a CodeMirror `Decoration.replace` widget.
- The widget renders a styled `<span>` instead of leaving the markdown syntax visible.

### Regex model

The editor layer scans for:

- annotated highlights: `==text==<!--comment-->`
- plain highlights: `==text==`

### Widget behavior

Each highlight widget:

- renders the highlighted text only
- adds `.has-comment` when the comment is not empty after color extraction
- applies `backgroundColor` directly if a valid `@colorName` token exists
- opens a shared popover when clicked

## Comment Popover Behavior

The popover UI lives in [`src/editor/popover.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/popover.tsx).

### Available actions

- Remove annotation
- Copy highlighted text
- Extract highlighted text to a new note
- Add or edit comment
- Choose a color

### Save semantics

On save:

- empty comment + no color becomes plain `==text==`
- non-empty comment becomes `==text==<!--comment-->`
- selected color is appended as ` @colorName`

### Validation rules

Comments may not contain:

- `-->`
- empty lines (`\n\n`)

The textarea allows Shift+Enter for a line break, but double newlines are rejected.

### Remove semantics

Remove strips the annotation markup entirely and restores only the raw highlighted text.

### Extract-to-file semantics

The extract action creates a new note whose filename is:

```text
<highlight text>.md
```

The generated content is:

- a wikilink to the current file basename if one exists
- a blockquote containing the highlighted text
- the highlighted text again as body text

This behavior is implemented in [`src/main.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/main.ts) and [`src/editor/extension.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/extension.tsx).

## Color System

Color parsing is handled by [`src/lib/utils.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/lib/utils.ts) and the full named-color list lives in [`src/colors.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/colors.ts).

### Color token format

- The plugin looks for the first `@word` token in the comment.
- The token only counts if it exactly matches a known color name from the built-in color catalog.

### Consequences

- User settings control which colors are shown as clickable choices in the popover.
- Actual parsing validity is still tied to the built-in color list, not the settings list alone.
- The first `@word` match wins.

## Reading View Behavior

The Reading View implementation lives in [`src/preview/postprocessor.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/preview/postprocessor.tsx) and [`src/preview/note.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/preview/note.tsx).

### Processing flow

- The postprocessor finds rendered `<mark>` elements in a preview section.
- It inspects the original markdown section text for annotated highlights using `==...==<!--...-->`.
- It tries to match rendered `<mark>` nodes back to parsed annotations by comparing the visible highlighted text.

### Reading View output

For annotated highlights with non-empty comment text:

- the `<mark>` gets tooltip text
- the `<mark>` gets `.has-comment`
- the `<mark>` gets inline background color if a valid color token exists
- a React-rendered margin note is added beside the section

Margin notes alternate left and right using a simple counter.

### Hover behavior

- Hovering the mark highlights the margin note background.
- Hovering the margin note adds a `.hover` class to the mark.

### Plain highlight behavior in Reading View

Plain `==text==` highlights render as normal markdown `<mark>` and receive the plugin CSS class, but they do not get margin notes because the postprocessor only creates notes for highlight-plus-comment forms.

## CSS and Presentation

Core styling lives in [`src/styles.css`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/styles.css).

### Live Preview styles

- highlighted text uses `.omnidian-highlight`
- commented highlights are shown with dashed underline
- hover increases saturation and changes underline style

### Reading View styles

- marks gain hover affordance
- margin comments are absolutely positioned to the left or right of the content block

## Architecture Summary

### Main plugin layer

[`src/main.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/main.ts)

- loads settings
- registers commands
- toggles global highlight mode
- wires document-level mouse/touch listeners
- registers editor extension
- registers markdown postprocessor

### Editor layer

[`src/editor/commands.ts`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/commands.ts)

- validates selections
- expands boundaries
- creates highlights

[`src/editor/extension.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/extension.tsx)

- parses markdown in the editor
- replaces matched ranges with widgets
- manages the shared popover
- rewrites source text on save/remove

[`src/editor/popover.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/editor/popover.tsx)

- comment editing UI
- color picker UI
- extract/copy/remove actions

### Preview layer

[`src/preview/postprocessor.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/preview/postprocessor.tsx)

- maps rendered `<mark>` nodes to source annotations
- creates margin note renderers

[`src/preview/note.tsx`](/Users/10x/dev/projects/oss/obsidian-note-annotations/src/preview/note.tsx)

- renders hover-linked side comments

## Current Limitations and Fragile Areas

### Content model limitations

- Highlights must stay on one line.
- Highlights cannot span multiple blocks or paragraphs.
- Comments are stored in HTML comments, so they are constrained by HTML comment syntax.
- There is no stable annotation ID.
- Annotation text edits are source-rewrite operations, not structured model updates.

### Matching limitations

- Reading View matches annotations to marks by visible text, which can become ambiguous if the same highlighted text appears multiple times in the same processed section.
- The editor parser and preview parser are regex-based and may be brittle around edge cases.

### UX limitations

- Highlight mode is global and enforced with document-level mouse/touch listeners.
- Editor interaction is partially blocked while highlight mode is on.
- Status bar text is raw boolean state instead of a polished label.
- The current color-settings UX implies runtime configurability, but the editor extension only consumes colors from plugin load.

### Data and note-creation limitations

- Extracted filenames are derived directly from highlighted text.
- File creation uses the current file basename, not a full safe reference model.
- Comments and colors are mixed into a single comment string instead of stored separately.

## Behavior Gaps Between README and Code

- README mentions Command on Mac and Control on Windows for selection behavior, but the implementation checks `metaKey` and `altKey`.
- README frames comments as margin notes in Reading View, which is true, but plain highlights without comments do not get note UI.
- README mentions available colors coming from plugin options, but the parser still depends on the built-in color catalog.

## Redesign Implications

If this plugin is going to be redesigned heavily, the biggest architectural pressure points are:

- inline storage format with no stable IDs
- regex-based parsing in both editor and preview
- ambiguous Reading View matching by text content
- global event interception for highlight mode
- mixed comment-plus-color serialization

Those are likely the first places to revisit before making visual or workflow improvements.
