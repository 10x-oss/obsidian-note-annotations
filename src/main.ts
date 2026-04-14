import {
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	type Editor,
} from "obsidian";
import {
	highlightExtension,
	cleanup as cleanupPopover,
} from "./editor/extension";
import { OmnidianSettingTab } from "@/settings";
import {
	createBlockAnnotationCommand,
	createHighlightCommand,
} from "@/editor/commands";
import postprocessor from "@/preview/postprocessor";
import {
	ANNOTATIONS_OUTLINE_VIEW_TYPE,
	AnnotationsOutlineView,
} from "@/outline/view";
import "../manifest.json";
import type { Annotation, OmnidianSettings } from "@/types";
import {
	extractAnnotations,
	getEffectiveAnnotationType,
	offsetToPosition,
} from "@/lib/parser";
import { sanitizeFilename } from "@/lib/utils";

const DEFAULT_SETTINGS: OmnidianSettings = {
	expandSelection: true,
	colors: [
		"gold",
		"lightblue",
		"lightgreen",
		"lightsalmon",
		"violet",
		"lightcoral",
		"lightgray",
	],
	defaultAnnotationType: "note",
	autoAssignIds: true,
	showMarginNotes: true,
	threadDisplay: "inline",
	outlineDisplay: "annotations",
};

export default class OmnidianPlugin extends Plugin {
	settings: OmnidianSettings = DEFAULT_SETTINGS;
	isHighlightingModeOn = false;
	statusBarItemEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon(
			"highlighter",
			this.isHighlightingModeOn ? "Disable highlighting mode" : "Enable highlighting mode",
			() => this.toggleHighlightingMode(),
		);

		this.addStatusBarModeIndicator();

		this.registerEditorExtension([highlightExtension(this)]);

		this.addCommand({
			id: "create-highlight",
			name: "Highlight selection",
			editorCallback: (editor) => this.createInlineHighlight(editor),
		});

		this.addCommand({
			id: "create-block-annotation",
			name: "Create block annotation",
			editorCallback: (editor) =>
				createBlockAnnotationCommand(editor, {
					autoAssignIds: this.settings.autoAssignIds,
				}),
		});

		this.addCommand({
			id: "toggle-highlighting-mode",
			name: "Toggle highlight mode",
			editorCallback: () => this.toggleHighlightingMode(),
		});

		this.addCommand({
			id: "list-annotations",
			name: "List annotations in current file",
			callback: () => void this.showAnnotationList(),
		});

		this.addCommand({
			id: "remove-all-annotations",
			name: "Remove all annotations in current file",
			callback: () => void this.removeAllAnnotations(),
		});

		this.addCommand({
			id: "open-annotations-outline",
			name: "Open annotations outline",
			callback: () => void this.activateAnnotationsOutline(),
		});

		this.registerView(
			ANNOTATIONS_OUTLINE_VIEW_TYPE,
			(leaf) => new AnnotationsOutlineView(leaf, this),
		);

		this.addSettingTab(new OmnidianSettingTab(this.app, this));

		this.registerDomEvent(
			document,
			"mousedown",
			this.lockEditorInHighlightingModeEventHandler,
		);
		this.registerDomEvent(
			document,
			"touchstart",
			this.lockEditorInHighlightingModeEventHandler,
		);
		this.registerDomEvent(document, "mouseup", this.highlightEventHandler);
		this.registerDomEvent(document, "touchend", this.highlightEventHandler);

		this.registerMarkdownPostProcessor(postprocessor(this));

		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				void this.refreshAnnotationOutlineViews();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.refreshAnnotationOutlineViews();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (!(file instanceof TFile)) {
					return;
				}

				const activeFile = this.app.workspace.getActiveFile();

				if (activeFile && file.path === activeFile.path) {
					await this.refreshAnnotationOutlineViews();
				}
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", async (file) => {
				const activeFile = this.app.workspace.getActiveFile();

				if (activeFile && file.path === activeFile.path) {
					await this.refreshAnnotationOutlineViews();
				}
			}),
		);
	}

	lockEditorInHighlightingModeEventHandler = (event: MouseEvent | TouchEvent) => {
		if (
			this.isHighlightingModeOn &&
			event.target instanceof HTMLElement &&
			event.target.closest(".is-live-preview") &&
			!(
				event.target.closest("#omnidian-comment-popover-container") ||
				event.target.closest(".omnidian-comment-popover")
			)
		) {
			event.preventDefault();
			this.app.workspace.activeEditor?.editor?.blur();
		}
	};

	highlightEventHandler = async (event: MouseEvent | TouchEvent) => {
		const editor = this.app.workspace.activeEditor?.editor;
		const selection = editor?.getSelection();

		if (!editor || !selection) {
			return;
		}

		if (
			event.target instanceof HTMLElement &&
			!event.target.closest(".is-live-preview")
		) {
			return;
		}

		if (
			!this.isHighlightingModeOn &&
			!("altKey" in event && event.altKey)
		) {
			return;
		}

		await this.createInlineHighlight(editor, {
			expandSelection: this.settings.expandSelection && !("altKey" in event && event.altKey),
		});
	};

	toggleHighlightingMode() {
		this.isHighlightingModeOn = !this.isHighlightingModeOn;
		this.statusBarItemEl?.setText(getModeText(this.isHighlightingModeOn));
		new Notice(
			this.isHighlightingModeOn
				? "Highlighting mode enabled"
				: "Highlighting mode disabled",
		);
	}

	addStatusBarModeIndicator() {
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText(getModeText(this.isHighlightingModeOn));
		this.statusBarItemEl.addEventListener("click", () =>
			this.toggleHighlightingMode(),
		);
	}

	async createInlineHighlight(
		editor: Editor,
		options?: { expandSelection?: boolean },
	) {
		return createHighlightCommand(editor, {
			autoAssignIds: this.settings.autoAssignIds,
			expandSelection: options?.expandSelection ?? this.settings.expandSelection,
		});
	}

	async extractAnnotationToFile(annotation: Annotation) {
		const currentFile = this.app.workspace.getActiveFile();
		const fileName =
			sanitizeFilename(annotation.highlightText) || "Extracted annotation";
		let path = `${fileName}.md`;
		let suffix = 1;

		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${fileName} ${suffix}.md`;
			suffix++;
		}

		const frontmatterLines = [
			"---",
			...(currentFile ? [`source: "[[${currentFile.basename}]]"`] : []),
			...(annotation.id ? [`annotation_id: "${annotation.id}"`] : []),
			...(annotation.type ? [`type: "${annotation.type}"`] : []),
			"---",
		];
		const noteContent = [
			frontmatterLines.join("\n"),
			"",
			`> ${annotation.highlightText}`,
			"",
			annotation.body,
		]
			.filter(Boolean)
			.join("\n");
		const newFile = await this.app.vault.create(path, noteContent);
		await this.app.workspace.getLeaf(true).openFile(newFile);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.refreshAnnotationOutlineViews();
	}

	onunload() {
		cleanupPopover();
	}

	private async showAnnotationList() {
		const file = this.app.workspace.getActiveFile();

		if (!file) {
			new Notice("No active file.");
			return;
		}

		const contents = await this.app.vault.read(file);
		const annotations = extractAnnotations(contents);

		if (!annotations.length) {
			new Notice("No annotations found in the current file.");
			return;
		}

		new AnnotationListModal(this, file, contents, annotations).open();
	}

	private async removeAllAnnotations() {
		const file = this.app.workspace.getActiveFile();

		if (!file) {
			new Notice("No active file.");
			return;
		}

		const contents = await this.app.vault.read(file);
		const annotations = extractAnnotations(contents);

		if (!annotations.length) {
			new Notice("No annotations found in the current file.");
			return;
		}

		let nextContents = contents;

		for (const annotation of [...annotations].sort((left, right) => right.from - left.from)) {
			nextContents =
				nextContents.slice(0, annotation.from) +
				annotation.highlightText +
				nextContents.slice(annotation.to);
		}

		await this.app.vault.modify(file, nextContents);
		new Notice(`Removed ${annotations.length} annotations.`);
	}

	async jumpToAnnotation(file: TFile, contents: string, annotation: Annotation) {
		await this.app.workspace.getLeaf(true).openFile(file);

		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) {
			return;
		}

		const position = offsetToPosition(contents, annotation.from);
		editor.setCursor(position);
		editor.scrollIntoView(
			{
				from: position,
				to: position,
			},
			true,
		);
	}

	async jumpToOffset(file: TFile, contents: string, offset: number) {
		await this.app.workspace.getLeaf(true).openFile(file);

		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) {
			return;
		}

		const position = offsetToPosition(contents, offset);
		editor.setCursor(position);
		editor.scrollIntoView(
			{
				from: position,
				to: position,
			},
			true,
		);
	}

	getFileAnnotations(contents: string) {
		return extractAnnotations(contents);
	}

	private async activateAnnotationsOutline() {
		const leaf = await this.app.workspace.ensureSideLeaf(
			ANNOTATIONS_OUTLINE_VIEW_TYPE,
			"right",
			{
				active: true,
				reveal: true,
			},
		);

		await leaf.setViewState({
			type: ANNOTATIONS_OUTLINE_VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
		await this.refreshAnnotationOutlineViews();
	}

	private async refreshAnnotationOutlineViews() {
		const leaves = this.app.workspace.getLeavesOfType(
			ANNOTATIONS_OUTLINE_VIEW_TYPE,
		);

		for (const leaf of leaves) {
			if (leaf.view instanceof AnnotationsOutlineView) {
				await leaf.view.refresh();
			}
		}
	}
}

class AnnotationListModal extends Modal {
	constructor(
		private plugin: OmnidianPlugin,
		private file: TFile,
		private contents: string,
		private annotations: Annotation[],
	) {
		super(plugin.app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Annotations in current file" });

		const groups = new Map<string, Annotation[]>();

		for (const annotation of this.annotations) {
			const key = getEffectiveAnnotationType(annotation) ?? "plain";
			const existing = groups.get(key) ?? [];
			existing.push(annotation);
			groups.set(key, existing);
		}

		for (const [type, annotations] of groups) {
			contentEl.createEl("h3", { text: type });

			for (const annotation of annotations) {
				const setting = new Setting(contentEl)
					.setName(annotation.highlightText.slice(0, 80))
					.setDesc(
						annotation.body ||
							annotation.id ||
							(annotation.kind === "block" ? "Block annotation" : "Highlight"),
					);

				setting.addButton((button) =>
					button.setButtonText("Jump").onClick(async () => {
						await this.plugin.jumpToAnnotation(
							this.file,
							this.contents,
							annotation,
						);
						this.close();
					}),
				);
			}
		}
	}
}

function getModeText(isHighlightingModeOn: boolean) {
	return `Highlighting: ${isHighlightingModeOn ? "ON" : "OFF"}`;
}
