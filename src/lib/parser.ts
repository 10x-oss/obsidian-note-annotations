import { ANNOTATION_TYPES, type Annotation, type AnnotationThread, type AnnotationType } from "@/types";
import colors from "@/colors";

const annotationTypeSet = new Set<string>(ANNOTATION_TYPES);
const colorSet = new Set(colors.map((color) => color.name));
const blockStartRegex =
	/^%%ann-start\s+(#[a-f0-9]{4,6})(?:\s+(:[a-z]+:))?(?:\s+@([\w-]+))?%%$/m;

export function extractAnnotations(text: string) {
	const blockAnnotations = extractBlockAnnotations(text);
	const inlineAnnotations = extractInlineAnnotations(text, blockAnnotations);

	return [...blockAnnotations, ...inlineAnnotations].sort(
		(left, right) => left.from - right.from,
	);
}

export function parseAnnotationPayload(rawPayload: string) {
	let payload = rawPayload.trim();
	let color: string | null = null;

	const colorMatch = payload.match(/(?:^|\n|\s)@([\w-]+)\s*$/);

	if (colorMatch) {
		const matchedColor = colorMatch[1];

		if (isKnownColor(matchedColor)) {
			color = matchedColor;
			payload = payload.slice(0, colorMatch.index).trimEnd();
		}
	}

	let id: string | null = null;
	const idMatch = payload.match(/^#([a-f0-9]{4,6})(?=$|\s|\n)/);

	if (idMatch) {
		id = `#${idMatch[1]}`;
		payload = payload.slice(idMatch[0].length).trimStart();
	}

	let type: AnnotationType | null = null;
	const typeMatch = payload.match(/^:([a-z]+):(?=$|\s|\n)/);

	if (typeMatch && isAnnotationType(typeMatch[1])) {
		type = typeMatch[1];
		payload = payload.slice(typeMatch[0].length).trimStart();
	}

	const body = payload.trim();

	return {
		id,
		type,
		body,
		color,
		threads: parseThreads(body),
	};
}

export function parseThreads(body: string): AnnotationThread[] {
	const lines = body
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	if (!lines.length) {
		return [];
	}

	const threads: AnnotationThread[] = [];

	for (const line of lines) {
		const match = line.match(/^\[([^\]]+)\]\s?(.*)$/);

		if (!match) {
			return [];
		}

		threads.push({
			speaker: match[1].trim(),
			message: match[2].trim(),
		});
	}

	return threads;
}

export function getEffectiveAnnotationType(annotation: Annotation) {
	if (annotation.type) {
		return annotation.type;
	}

	return annotation.body.trim() ? "note" : null;
}

export function getAnnotationTooltip(annotation: Annotation) {
	if (!annotation.body.trim()) {
		return "";
	}

	if (annotation.threads.length) {
		return annotation.threads[0].message;
	}

	return annotation.body.split("\n")[0].trim();
}

export function isAnnotationType(value: string): value is AnnotationType {
	return annotationTypeSet.has(value);
}

export function isKnownColor(colorName: string) {
	return colorSet.has(colorName);
}

export function generateAnnotationId(documentText: string) {
	const existingIds = new Set(
		extractAnnotations(documentText)
			.map((annotation) => annotation.id)
			.filter((value): value is string => Boolean(value)),
	);

	for (let length = 4; length <= 6; length += 2) {
		for (let attempt = 0; attempt < 256; attempt++) {
			const id = `#${randomHex(length)}`;

			if (!existingIds.has(id)) {
				return id;
			}
		}
	}

	throw new Error("Could not generate a unique annotation ID.");
}

export function offsetToPosition(text: string, offset: number) {
	let line = 0;
	let ch = 0;

	for (let index = 0; index < offset && index < text.length; index++) {
		if (text[index] === "\n") {
			line++;
			ch = 0;
			continue;
		}

		ch++;
	}

	return { line, ch };
}

function extractBlockAnnotations(text: string) {
	const annotations: Annotation[] = [];
	let searchFrom = 0;

	while (searchFrom < text.length) {
		const start = text.indexOf("%%ann-start", searchFrom);

		if (start === -1) {
			break;
		}

		const startLineEnd = text.indexOf("\n", start);
		const startLineBoundary =
			startLineEnd === -1 ? text.length : startLineEnd;
		const startLine = text.slice(start, startLineBoundary).trim();
		const startMatch = startLine.match(blockStartRegex);

		if (!startMatch) {
			searchFrom = start + "%%ann-start".length;
			continue;
		}

		const id = startMatch[1];
		const rawType = startMatch[2]?.slice(1, -1) ?? null;
		const type = rawType && isAnnotationType(rawType) ? rawType : null;
		const rawColor = startMatch[3] ?? null;
		const color = rawColor && isKnownColor(rawColor) ? rawColor : null;
		const afterStart = startLineEnd === -1 ? text.length : startLineEnd + 1;
		const endMarker = `%%ann-end ${id}%%`;
		const endStart = text.indexOf(endMarker, afterStart);

		if (endStart === -1) {
			searchFrom = afterStart;
			continue;
		}

		const endLineEnd = text.indexOf("\n", endStart);
		const afterEnd = endLineEnd === -1 ? text.length : endLineEnd + 1;
		const closeMarker = "%%ann-close%%";
		const closeStart = text.indexOf(closeMarker, afterEnd);

		if (closeStart === -1) {
			searchFrom = afterEnd;
			continue;
		}

		const closeEnd = closeStart + closeMarker.length;
		const highlightText = trimOuterNewline(text.slice(afterStart, endStart));
		const body = trimOuterNewline(text.slice(afterEnd, closeStart));

		annotations.push({
			id,
			kind: "block",
			type,
			body,
			color,
			highlightText,
			threads: parseThreads(body),
			from: start,
			to: closeEnd,
		});

		searchFrom = closeEnd;
	}

	return annotations;
}

function extractInlineAnnotations(text: string, excludedAnnotations: Annotation[]) {
	const annotations: Annotation[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		const start = text.indexOf("==", cursor);

		if (start === -1) {
			break;
		}

		if (isInsideExcludedRange(start, excludedAnnotations)) {
			cursor = getExcludedRangeEnd(start, excludedAnnotations);
			continue;
		}

		const lineEnd = text.indexOf("\n", start);
		const lineBoundary = lineEnd === -1 ? text.length : lineEnd;
		const end = text.indexOf("==", start + 2);

		if (end === -1 || end >= lineBoundary) {
			cursor = start + 2;
			continue;
		}

		const highlightText = text.slice(start + 2, end);
		let annotationEnd = end + 2;
		let id: string | null = null;
		let type: AnnotationType | null = null;
		let body = "";
		let color: string | null = null;
		let threads: AnnotationThread[] = [];

		if (text.slice(annotationEnd, annotationEnd + 4) === "<!--") {
			const commentEnd = text.indexOf("-->", annotationEnd + 4);

			if (commentEnd !== -1) {
				const parsed = parseAnnotationPayload(
					text.slice(annotationEnd + 4, commentEnd),
				);

				id = parsed.id;
				type = parsed.type;
				body = parsed.body;
				color = parsed.color;
				threads = parsed.threads;
				annotationEnd = commentEnd + 3;
			}
		}

		annotations.push({
			id,
			kind: "inline",
			type,
			body,
			color,
			highlightText,
			threads,
			from: start,
			to: annotationEnd,
		});

		cursor = annotationEnd;
	}

	return annotations;
}

function isInsideExcludedRange(position: number, excludedAnnotations: Annotation[]) {
	return excludedAnnotations.some(
		(annotation) => position >= annotation.from && position < annotation.to,
	);
}

function getExcludedRangeEnd(position: number, excludedAnnotations: Annotation[]) {
	return (
		excludedAnnotations.find(
			(annotation) => position >= annotation.from && position < annotation.to,
		)?.to ?? position + 1
	);
}

function randomHex(length: number) {
	if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
		const bytes = new Uint8Array(length / 2);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
	}

	return Math.random()
		.toString(16)
		.slice(2, 2 + length)
		.padEnd(length, "0");
}

function trimOuterNewline(value: string) {
	return value.replace(/^\n/, "").replace(/\n$/, "");
}
