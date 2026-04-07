import { useMemo, useState } from "react";
import { Notice } from "obsidian";
import { parseThreads } from "@/lib/parser";
import type { Annotation, AnnotationDraft, AnnotationType, ThreadDisplayMode } from "@/types";
import { ANNOTATION_TYPES } from "@/types";
import { cn } from "@/lib/utils";

interface CommentPopoverProps {
	annotation: Annotation;
	className: string;
	colorOptions: string[];
	defaultType: AnnotationType;
	threadDisplay: ThreadDisplayMode;
	onClose: () => void;
	onExtract: () => void;
	onRemove: () => void;
	onSave: (draft: AnnotationDraft) => void;
}

export default function CommentPopover({
	annotation,
	className,
	colorOptions,
	defaultType,
	threadDisplay,
	onClose,
	onExtract,
	onRemove,
	onSave,
}: CommentPopoverProps) {
	const [body, setBody] = useState(annotation.body);
	const [reply, setReply] = useState("");
	const [selectedType, setSelectedType] = useState<AnnotationType | "">(
		annotation.type ?? defaultType,
	);
	const [selectedColor, setSelectedColor] = useState(annotation.color ?? "");
	const [error, setError] = useState("");
	const threads = useMemo(() => parseThreads(body), [body]);

	const save = () => {
		const validationError = validateBody(body, reply);

		if (validationError) {
			setError(validationError);
			return;
		}

		const nextBody = buildBody(body, reply);

		onSave({
			id: annotation.id,
			kind: annotation.kind,
			type: selectedType || null,
			body: nextBody,
			color: selectedColor || null,
			highlightText: annotation.highlightText,
		});
		onClose();
	};

	return (
		<div className={cn(className, "omnidian-comment-popover")}>
			<div className="omnidian-comment-popover__header">
				<button
					type="button"
					className="omnidian-comment-popover__danger"
					onClick={() => {
						onRemove();
						onClose();
					}}
				>
					Remove
				</button>
				<div className="omnidian-comment-popover__actions">
					<button
						type="button"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(annotation.highlightText);
								new Notice("Copied highlighted text.");
							} catch (copyError) {
								console.error(copyError);
								new Notice("Could not copy highlighted text.");
							}
						}}
					>
						Copy
					</button>
					<button type="button" onClick={onExtract}>
						Extract
					</button>
					<button type="button" onClick={onClose}>
						Close
					</button>
				</div>
			</div>

			<div className="omnidian-comment-popover__body">
				<div className="omnidian-comment-popover__row">
					<label className="omnidian-comment-popover__field">
						<span>Type</span>
						<select
							value={selectedType}
							onChange={(event) =>
								setSelectedType(event.target.value as AnnotationType | "")
							}
						>
							<option value="">None</option>
							{ANNOTATION_TYPES.map((type) => (
								<option key={type} value={type}>
									{type}
								</option>
							))}
						</select>
					</label>

					<div className="omnidian-comment-popover__field">
						<span>Color</span>
						<div className="omnidian-comment-popover__colors">
							<ColorButton
								color=""
								selected={selectedColor === ""}
								onClick={() => setSelectedColor("")}
								label="Default"
							/>
							{colorOptions.map((color) => (
								<ColorButton
									key={color}
									color={color}
									selected={selectedColor === color}
									onClick={() => setSelectedColor(color)}
									label={color}
								/>
							))}
						</div>
					</div>
				</div>

				<label className="omnidian-comment-popover__field omnidian-comment-popover__field--stacked">
					<span>Comment</span>
					<textarea
						className="omnidian-comment-popover__textarea"
						rows={threads.length ? 6 : 5}
						value={body}
						onChange={(event) => {
							setBody(event.target.value);
							setError("");
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								save();
							}
						}}
					/>
				</label>

				{threadDisplay === "inline" && threads.length > 0 && (
					<div className="omnidian-comment-thread">
						<span className="omnidian-comment-thread__label">Thread</span>
						{threads.map((thread, index) => (
							<div
								key={`${thread.speaker}-${index}`}
								className={cn("omnidian-comment-turn", {
									"omnidian-comment-turn-ai": thread.speaker === "ai",
									"omnidian-comment-turn-user": thread.speaker === "user",
								})}
							>
								<strong>[{thread.speaker}]</strong> {thread.message}
							</div>
						))}
					</div>
				)}

				{threads.length > 0 && (
					<label className="omnidian-comment-popover__field omnidian-comment-popover__field--stacked">
						<span>Add reply</span>
						<textarea
							className="omnidian-comment-popover__textarea omnidian-comment-popover__textarea--compact"
							rows={2}
							value={reply}
							onChange={(event) => {
								setReply(event.target.value);
								setError("");
							}}
							placeholder="Adds a [user] reply on save"
						/>
					</label>
				)}

				<div className="omnidian-comment-popover__meta">
					<span>ID: {annotation.id ?? "legacy"}</span>
					<span>
						{annotation.kind === "block" ? "Block annotation" : "Inline annotation"}
					</span>
				</div>

				{error && <div className="omnidian-comment-popover__error">{error}</div>}

				<div className="omnidian-comment-popover__footer">
					<button type="button" className="mod-cta" onClick={save}>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

function ColorButton({
	color,
	label,
	onClick,
	selected,
}: {
	color: string;
	label: string;
	onClick: () => void;
	selected: boolean;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			className={cn("omnidian-comment-popover__color", {
				"is-selected": selected,
			})}
			style={{
				backgroundColor: color || "var(--text-highlight-bg)",
			}}
			onClick={onClick}
		/>
	);
}

function buildBody(body: string, reply: string) {
	const trimmedBody = body.trim();
	const trimmedReply = reply.trim();

	if (!trimmedReply) {
		return trimmedBody;
	}

	return [trimmedBody, `[user] ${trimmedReply}`].filter(Boolean).join("\n");
}

function validateBody(body: string, reply: string) {
	const nextBody = buildBody(body, reply);

	if (nextBody.includes("-->")) {
		return "Comment body must not contain -->";
	}

	if (nextBody.includes("%%ann-")) {
		return "Comment body must not contain %%ann-";
	}

	return "";
}
