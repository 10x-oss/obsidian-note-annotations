import {
	ItemView,
	Setting,
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

		const file = this.plugin.app.workspace.getActiveFile();

		if (!file) {
			contentEl.createDiv({
				cls: "omnidian-outline-view__empty",
				text: "Open a note to see its annotations outline.",
			});
			return;
		}

		const contents = await this.plugin.app.vault.read(file);
		const annotations = this.plugin.getFileAnnotations(contents);
		const headingSections = buildOutlineSections(
			this.plugin.app.metadataCache.getFileCache(file)?.headings ?? [],
			annotations,
		);

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

		for (const section of headingSections) {
			if (
				this.plugin.settings.outlineDisplay === "annotations" &&
				!section.annotations.length
			) {
				continue;
			}

			renderSection(
				contentEl,
				section,
				file,
				contents,
				this.plugin,
				this.plugin.settings.outlineDisplay,
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

function renderSection(
	root: HTMLElement,
	section: OutlineSection,
	file: TFile,
	contents: string,
	plugin: OmnidianPlugin,
	displayMode: "annotations" | "mixed",
) {
	const sectionEl = root.createDiv({ cls: "omnidian-outline-section" });
	const headingLabel = section.heading
		? `${"#".repeat(section.heading.level)} ${section.heading.heading}`
		: "Top of note";

	const headingRow = sectionEl.createDiv({
		cls: "omnidian-outline-section__row",
	});
	const headingInfo = new Setting(headingRow)
		.setName(
			displayMode === "mixed"
				? headingLabel
				: `${headingLabel} (${section.annotations.length})`,
		)
		.setDesc(
			displayMode === "mixed"
				? `${section.annotations.length} annotation${
						section.annotations.length === 1 ? "" : "s"
				  }`
				: "",
		);

	headingInfo.settingEl.addClass("omnidian-outline-section__heading-setting");
	headingInfo.infoEl.addClass("omnidian-outline-section__heading-info");
	headingInfo.settingEl.addClass("omnidian-outline-clickable");

	if (section.heading) {
		makeClickable(headingInfo.settingEl, async () => {
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
		const setting = new Setting(annotationsRoot)
			.setName(annotation.highlightText.replace(/\s+/g, " ").slice(0, 90))
			.setDesc(buildAnnotationDescription(annotation));

		setting.settingEl.addClass("omnidian-outline-item");
		setting.infoEl.addClass("omnidian-outline-item__info");
		setting.settingEl.addClass("omnidian-outline-clickable");

		if (annotation.color) {
			setting.settingEl.style.borderLeftColor = annotation.color;
			setting.settingEl.style.background = `color-mix(in srgb, ${annotation.color} 10%, transparent)`;
		}

		makeClickable(setting.settingEl, async () => {
			await plugin.jumpToAnnotation(file, contents, annotation);
		});
	}
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
