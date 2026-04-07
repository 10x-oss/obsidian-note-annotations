import type { MarkdownPostProcessorContext } from "obsidian";
import type OmnidianPlugin from "@/main";
import CommentRenderer from "./note";
import { extractAnnotations, getAnnotationTooltip, getEffectiveAnnotationType } from "@/lib/parser";

export default function postprocessor(plugin: OmnidianPlugin) {
	return (
		element: HTMLElement,
		{ addChild, getSectionInfo }: MarkdownPostProcessorContext,
	) => {
		const marks = element.findAll("mark");

		if (!marks.length) {
			return;
		}

		const section = getSectionInfo(element);

		if (!section) {
			return;
		}

		const annotations = extractAnnotations(section.text).filter(
			(annotation) => annotation.kind === "inline",
		);

		let cursor = 0;
		let marginIndex = 0;

		for (const mark of marks) {
			const annotation = findNextMatchingAnnotation(
				mark.innerText,
				annotations,
				cursor,
			);

			if (!annotation) {
				continue;
			}

			cursor = annotations.indexOf(annotation) + 1;
			mark.addClass("omnidian-highlight");

			const effectiveType = getEffectiveAnnotationType(annotation);

			if (annotation.id) {
				mark.dataset["annotationId"] = annotation.id;
			}

			if (effectiveType) {
				mark.dataset["annotationType"] = effectiveType;
				mark.addClass(`type-${effectiveType}`);
			}

			if (annotation.color) {
				mark.style.backgroundColor = annotation.color;
				mark.addClass("has-color");
			}

			if (annotation.body.trim()) {
				mark.addClass("has-comment");
				mark.setAttribute("title", getAnnotationTooltip(annotation));
			}

			if (!plugin.settings.showMarginNotes || !annotation.body.trim()) {
				continue;
			}

			element.addClass("relative");
			addChild(
				new CommentRenderer(
					element,
					annotation,
					marginIndex % 2 ? "left" : "right",
					mark,
				),
			);
			marginIndex++;
		}
	};
}

function findNextMatchingAnnotation(
	text: string,
	annotations: ReturnType<typeof extractAnnotations>,
	startIndex: number,
) {
	for (let index = startIndex; index < annotations.length; index++) {
		if (annotations[index].highlightText === text) {
			return annotations[index];
		}
	}

	return annotations.slice(startIndex).find(
		(annotation) => annotation.highlightText.trim() === text.trim(),
	);
}
