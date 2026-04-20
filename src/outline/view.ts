import {
	ItemView,
	type HeadingCache,
	type TFile,
	type WorkspaceLeaf,
} from "obsidian";
import type OmnidianPlugin from "@/main";
import type { Annotation } from "@/types";
import { getEffectiveAnnotationType } from "@/lib/parser";

export const ANNOTATIONS_OUTLINE_VIEW_TYPE = "omnidian-annotations-outline";

interface OutlineSection {
	heading: HeadingCache | null;
	annotations: Annotation[];
}

interface OutlineTreeNode {
	heading: HeadingCache | null;
	annotations: Annotation[];
	children: OutlineTreeNode[];
}

export class AnnotationsOutlineView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: OmnidianPlugin,
	) {
		super(leaf);
	}

	getViewType() {
		return ANNOTATIONS_OUTLINE_VIEW_TYPE;
	}

	getDisplayText() {
		return "Annotations Outline";
	}

	getIcon() {
		return "list-tree";
	}

	async onOpen() {
		this.addAction("refresh-cw", "Refresh annotations outline", () => {
			void this.refresh();
		});
		await this.refresh();
	}

	async refresh() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("omnidian-outline-view");

		const file = this.plugin.getCurrentContextFile();

		if (!file) {
			contentEl.createDiv({
				cls: "omnidian-outline-view__empty",
				text: "Open a note to see its annotations outline.",
			});
			return;
		}

		const contents = await this.plugin.app.vault.read(file);
		const annotations = this.plugin.getFileAnnotations(contents);
		const headings = this.plugin.app.metadataCache.getFileCache(file)?.headings ?? [];

		renderHeader(
			contentEl,
			file,
			annotations.length,
			this.plugin.settings.outlineDisplay,
		);

		if (
			!annotations.length &&
			this.plugin.settings.outlineDisplay === "annotations"
		) {
			contentEl.createDiv({
				cls: "omnidian-outline-view__empty",
				text: "No annotations in this note yet.",
			});
			return;
		}

		if (this.plugin.settings.outlineDisplay === "mixed") {
			const tree = buildOutlineTree(headings, annotations);
			renderTree(
				contentEl,
				file,
				contents,
				this.plugin,
				tree,
			);
			return;
		}

		const headingSections = buildOutlineSections(headings, annotations);

		for (const section of headingSections) {
			if (!section.annotations.length) {
				continue;
			}

			renderFlatSection(
				contentEl,
				section,
				file,
				contents,
				this.plugin,
			);
		}
	}
}

function renderHeader(
	root: HTMLElement,
	file: TFile,
	count: number,
	displayMode: "annotations" | "mixed",
) {
	const header = root.createDiv({ cls: "omnidian-outline-view__header" });
	header.createDiv({
		cls: "omnidian-outline-view__title",
		text:
			displayMode === "mixed"
				? "Mixed Outline"
				: "Annotations Outline",
	});
	header.createDiv({
		cls: "omnidian-outline-view__subtitle",
		text:
			displayMode === "mixed"
				? `${file.basename} • headings + ${count} annotation${count === 1 ? "" : "s"}`
				: `${file.basename} • ${count} annotation${count === 1 ? "" : "s"}`,
	});
}

function renderFlatSection(
	root: HTMLElement,
	section: OutlineSection,
	file: TFile,
	contents: string,
	plugin: OmnidianPlugin,
) {
	const sectionEl = root.createDiv({ cls: "omnidian-outline-section" });
	const headingLabel = section.heading
		? `${"#".repeat(section.heading.level)} ${section.heading.heading}`
		: "Top of note";

	const headingRow = sectionEl.createDiv({
		cls: "omnidian-outline-section__heading-setting omnidian-outline-clickable",
	});
	const headingInfo = headingRow.createDiv({
		cls: "omnidian-outline-section__heading-info",
	});
	headingInfo.createDiv({
		cls: "omnidian-outline-heading__title",
		text: `${headingLabel} (${section.annotations.length})`,
	});

	if (section.heading) {
		makeClickable(headingRow, async () => {
			await plugin.jumpToOffset(
				file,
				contents,
				section.heading?.position.start.offset ?? 0,
			);
		});
	}

	const annotationsRoot = sectionEl.createDiv({
		cls: "omnidian-outline-section__annotations",
	});

	for (const annotation of section.annotations) {
		renderAnnotationRow(
			annotationsRoot,
			annotation,
			file,
			contents,
			plugin,
		);
	}
}

function renderTree(
	root: HTMLElement,
	file: TFile,
	contents: string,
	plugin: OmnidianPlugin,
	tree: OutlineTreeNode,
) {
	if (tree.annotations.length) {
		const topSection = root.createDiv({ cls: "omnidian-outline-section" });
		const topHeading = topSection.createDiv({
			cls: "omnidian-outline-section__heading-setting",
		});
		const info = topHeading.createDiv({
			cls: "omnidian-outline-section__heading-info",
		});
		info.createDiv({
			cls: "omnidian-outline-heading__title",
			text: `Top of note (${tree.annotations.length})`,
		});

		const annotationsRoot = topSection.createDiv({
			cls: "omnidian-outline-tree__children",
		});

		for (const annotation of tree.annotations) {
			renderAnnotationRow(
				annotationsRoot,
				annotation,
				file,
				contents,
				plugin,
			);
		}
	}

	for (const child of tree.children) {
		renderTreeNode(root, child, file, contents, plugin);
	}
}

function renderTreeNode(
	root: HTMLElement,
	node: OutlineTreeNode,
	file: TFile,
	contents: string,
	plugin: OmnidianPlugin,
) {
	const nodeEl = root.createDiv({ cls: "omnidian-outline-tree__node" });
	const headingRow = nodeEl.createDiv({
		cls: "omnidian-outline-section__heading-setting omnidian-outline-clickable omnidian-outline-tree__heading",
	});
	const headingInfo = headingRow.createDiv({
		cls: "omnidian-outline-section__heading-info",
	});
	const annotationCount = countAnnotations(node);
	const headingLabel = node.heading
		? `${"#".repeat(node.heading.level)} ${node.heading.heading}`
		: "Top of note";

	headingInfo.createDiv({
		cls: "omnidian-outline-heading__title",
		text: headingLabel,
	});
	headingInfo.createDiv({
		cls: "omnidian-outline-heading__meta",
		text: `${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`,
	});

	if (node.heading) {
		makeClickable(headingRow, async () => {
			await plugin.jumpToOffset(
				file,
				contents,
				node.heading?.position.start.offset ?? 0,
			);
		});
	}

	const childrenEl = nodeEl.createDiv({
		cls: "omnidian-outline-tree__children",
	});

	for (const annotation of node.annotations) {
		renderAnnotationRow(childrenEl, annotation, file, contents, plugin);
	}

	for (const child of node.children) {
		renderTreeNode(childrenEl, child, file, contents, plugin);
	}
}

function renderAnnotationRow(
	root: HTMLElement,
	annotation: Annotation,
	file: TFile,
	contents: string,
	plugin: OmnidianPlugin,
) {
	const row = root.createDiv({
		cls: "omnidian-outline-item omnidian-outline-clickable",
	});
	const info = row.createDiv({ cls: "omnidian-outline-item__info" });

	info.createDiv({
		cls: "omnidian-outline-item__title",
		text: annotation.highlightText.replace(/\s+/g, " ").slice(0, 90),
	});
	info.createDiv({
		cls: "omnidian-outline-item__description",
		text: buildAnnotationDescription(annotation),
	});

	if (annotation.color) {
		row.style.borderLeftColor = annotation.color;
		row.style.background = `color-mix(in srgb, ${annotation.color} 10%, transparent)`;
	}

	makeClickable(row, async () => {
		await plugin.jumpToAnnotation(file, contents, annotation);
	});
}

function buildOutlineSections(
	headings: HeadingCache[],
	annotations: Annotation[],
) {
	if (!headings.length) {
		return [{ heading: null, annotations }];
	}

	const orderedHeadings = [...headings].sort(
		(left, right) => left.position.start.offset - right.position.start.offset,
	);
	const sections: OutlineSection[] = [
		{ heading: null, annotations: [] },
		...orderedHeadings.map((heading) => ({ heading, annotations: [] })),
	];

	for (const annotation of annotations) {
		let assignedSection = sections[0];

		for (const section of sections.slice(1)) {
			if (
				section.heading &&
				section.heading.position.start.offset <= annotation.from
			) {
				assignedSection = section;
				continue;
			}

			break;
		}

		assignedSection.annotations.push(annotation);
	}

	return sections;
}

function buildOutlineTree(
	headings: HeadingCache[],
	annotations: Annotation[],
) {
	const root: OutlineTreeNode = {
		heading: null,
		annotations: [],
		children: [],
	};
	const sortedHeadings = [...headings].sort(
		(left, right) => left.position.start.offset - right.position.start.offset,
	);
	const stack: OutlineTreeNode[] = [root];
	const flatNodes: OutlineTreeNode[] = [];

	for (const heading of sortedHeadings) {
		while (
			stack.length > 1 &&
			(stack.at(-1)?.heading?.level ?? 0) >= heading.level
		) {
			stack.pop();
		}

		const node: OutlineTreeNode = {
			heading,
			annotations: [],
			children: [],
		};
		stack.at(-1)?.children.push(node);
		stack.push(node);
		flatNodes.push(node);
	}

	for (const annotation of annotations) {
		let target = root;

		for (const node of flatNodes) {
			if ((node.heading?.position.start.offset ?? 0) <= annotation.from) {
				target = node;
				continue;
			}

			break;
		}

		target.annotations.push(annotation);
	}

	return root;
}

function buildAnnotationDescription(annotation: Annotation) {
	const tokens = [
		annotation.id ?? "legacy",
		getEffectiveAnnotationType(annotation) ?? "plain",
		annotation.kind,
	];

	if (annotation.body.trim()) {
		tokens.push(annotation.body.split("\n")[0].trim());
	}

	return tokens.join(" • ");
}

function makeClickable(element: HTMLElement, onClick: () => void | Promise<void>) {
	element.tabIndex = 0;
	element.setAttribute("role", "button");
	element.addEventListener("click", () => {
		void onClick();
	});
	element.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			void onClick();
		}
	});
}

function countAnnotations(node: OutlineTreeNode): number {
	return (
		node.annotations.length +
		node.children.reduce((sum, child) => sum + countAnnotations(child), 0)
	);
}
