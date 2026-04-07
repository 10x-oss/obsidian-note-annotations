export const ANNOTATION_TYPES = [
	"insight",
	"question",
	"definition",
	"connection",
	"summary",
	"disagree",
	"bookmark",
	"note",
] as const;

export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export type AnnotationKind = "inline" | "block";

export type ThreadDisplayMode = "inline" | "collapsed";
export type OutlineDisplayMode = "annotations" | "mixed";

export interface AnnotationThread {
	speaker: string;
	message: string;
}

export interface Annotation {
	id: string | null;
	kind: AnnotationKind;
	type: AnnotationType | null;
	body: string;
	color: string | null;
	highlightText: string;
	threads: AnnotationThread[];
	from: number;
	to: number;
}

export interface AnnotationDraft {
	id: string | null;
	type: AnnotationType | null;
	body: string;
	color: string | null;
	highlightText: string;
	kind: AnnotationKind;
}

export interface OmnidianSettings {
	expandSelection: boolean;
	colors: string[];
	defaultAnnotationType: AnnotationType;
	autoAssignIds: boolean;
	showMarginNotes: boolean;
	threadDisplay: ThreadDisplayMode;
	outlineDisplay: OutlineDisplayMode;
}
