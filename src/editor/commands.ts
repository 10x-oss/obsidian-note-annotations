import { Notice, type Editor } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { generateAnnotationId } from "@/lib/parser";
import { createBlockAnnotation, createInlineHighlight } from "./extension";

interface CreateHighlightOptions {
	autoAssignIds: boolean;
	expandSelection?: boolean;
}

export async function createHighlightCommand(
	editor: Editor,
	{ autoAssignIds, expandSelection = true }: CreateHighlightOptions,
) {
	let selectedText = editor.getSelection();

	if (!selectedText) {
		new Notice("No text selected");
		return false;
	}

	const sameLine =
		editor.getCursor("from").line === editor.getCursor("to").line;

	if (!sameLine) {
		new Notice("Inline highlights must stay on one line. Use block annotation instead.");
		return false;
	}

	if (selectedText.includes("==")) {
		new Notice("Selection already contains highlight markers.");
		return false;
	}

	if (selectedText.includes("%%ann-")) {
		new Notice("Selection already contains block annotation markers.");
		return false;
	}

	if (expandSelection) {
		selectedText = expandSelectionBoundary(editor);
	}

	editor.blur();
	document.getSelection()?.empty();

	const editorView = getEditorView(editor);

	if (!editorView) {
		new Notice("Could not access the active editor view.");
		return false;
	}

	const id = autoAssignIds
		? generateAnnotationId(editorView.state.doc.toString())
		: null;

	return createInlineHighlight(editorView, { id });
}

export async function createBlockAnnotationCommand(
	editor: Editor,
	{ autoAssignIds }: CreateHighlightOptions,
) {
	const selectedText = editor.getSelection();

	if (!selectedText) {
		new Notice("No text selected");
		return false;
	}

	if (selectedText.includes("%%ann-")) {
		new Notice("Nested block annotations are not supported.");
		return false;
	}

	const editorView = getEditorView(editor);

	if (!editorView) {
		new Notice("Could not access the active editor view.");
		return false;
	}

	const id = autoAssignIds
		? generateAnnotationId(editorView.state.doc.toString())
		: null;

	return createBlockAnnotation(editorView, { id });
}

function expandSelectionBoundary(editor: Editor) {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	const line = editor.getLine(from.line);
	let start = from.ch;
	let end = to.ch;

	while (
		start > 0 &&
		line[start - 1].match(/\w/) &&
		line.substring(start - 2, start) !== "=="
	) {
		start--;
	}

	while (
		end < line.length &&
		line[end].match(/\w/) &&
		line.substring(end, end + 2) !== "=="
	) {
		end++;
	}

	while (start < line.length && line[start].match(/\s/)) {
		start++;
	}

	while (end > 0 && line[end - 1].match(/\s/)) {
		end--;
	}

	editor.setSelection(
		{ line: from.line, ch: start },
		{ line: to.line, ch: end },
	);

	return editor.getSelection();
}

function getEditorView(editor: Editor) {
	return (editor as Editor & { cm?: EditorView }).cm ?? null;
}
