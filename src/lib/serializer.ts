import { getEffectiveAnnotationType, parseThreads } from "@/lib/parser";
import type { Annotation, AnnotationDraft } from "@/types";

export function serializeAnnotation(annotation: Annotation | AnnotationDraft) {
	if (annotation.kind === "block") {
		return serializeBlockAnnotation(annotation);
	}

	return serializeInlineAnnotation(annotation);
}

export function serializeInlineAnnotation(annotation: Annotation | AnnotationDraft) {
	const base = `==${annotation.highlightText}==`;
	const payload = serializeCommentPayload(annotation);

	if (!payload) {
		return base;
	}

	return `${base}<!--${payload}-->`;
}

export function serializeBlockAnnotation(annotation: Annotation | AnnotationDraft) {
	const id = annotation.id ?? "#legacy";
	const headerTokens = [id];

	if (annotation.type) {
		headerTokens.push(`:${annotation.type}:`);
	}

	if (annotation.color) {
		headerTokens.push(`@${annotation.color}`);
	}

	const lines = [
		`%%ann-start ${headerTokens.join(" ")}%%`,
		annotation.highlightText,
		`%%ann-end ${id}%%`,
		annotation.body,
		"%%ann-close%%",
	];

	return lines.join("\n");
}

export function serializeCommentPayload(annotation: Annotation | AnnotationDraft) {
	const tokens: string[] = [];

	if (annotation.id) {
		tokens.push(annotation.id);
	}

	if (annotation.type) {
		tokens.push(`:${annotation.type}:`);
	}

	let payload = tokens.join(" ");
	const body = annotation.body.trim();

	if (body) {
		payload = payload
			? `${payload}${body.includes("\n") ? "\n" : " "}${body}`
			: body;
	}

	if (annotation.color) {
		payload = payload
			? `${payload}${payload.includes("\n") ? "\n" : " "}@${annotation.color}`
			: `@${annotation.color}`;
	}

	return payload.trim();
}

export function normalizeAnnotationDraft(annotation: Annotation | AnnotationDraft) {
	const body = annotation.body.trim();
	const type = annotation.type ?? (body ? getEffectiveAnnotationType({
		...annotation,
		body,
		threads: parseThreads(body),
		from: 0,
		to: 0,
	}) : null);

	return {
		...annotation,
		body,
		type,
		threads: parseThreads(body),
	};
}
