import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import colors from "@/colors";
import { ANNOTATION_TYPES } from "@/types";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function matchColor(comment: string) {
	const colorMatch = comment.match(/@(\w+)/)?.at(1);
	if (!colorMatch) return null;
	return colors.some((color) => color.name === colorMatch)
		? colorMatch
		: null;
}

export function sanitizeFilename(value: string) {
	return value
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
}

export function isKnownAnnotationType(value: string) {
	return ANNOTATION_TYPES.includes(value as (typeof ANNOTATION_TYPES)[number]);
}
