import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownRenderChild } from "obsidian";
import { cn } from "@/lib/utils";
import { getEffectiveAnnotationType } from "@/lib/parser";
import type { Annotation } from "@/types";

export default class CommentRenderer extends MarkdownRenderChild {
	containerEl: HTMLElement;
	private rootEl: HTMLElement;
	private root: Root;

	constructor(
		containerEl: HTMLElement,
		private annotation: Annotation,
		private position: "left" | "right",
		private mark: HTMLElement,
	) {
		super(containerEl);
		this.containerEl = containerEl;
		this.rootEl = containerEl.createEl("div");
		this.root = createRoot(this.rootEl);
	}

	onload() {
		this.root.render(
			<Comment
				annotation={this.annotation}
				position={this.position}
				mark={this.mark}
			/>,
		);
	}

	onunload() {
		this.root.unmount();
	}
}

function Comment({
	annotation,
	position,
	mark,
}: {
	annotation: Annotation;
	position: "left" | "right";
	mark: HTMLElement;
}) {
	const [hover, setHover] = useState(false);
	const effectiveType = getEffectiveAnnotationType(annotation);

	useEffect(() => {
		const handleMouseEnter = () => setHover(true);
		const handleMouseLeave = () => setHover(false);

		mark.addEventListener("mouseenter", handleMouseEnter);
		mark.addEventListener("mouseleave", handleMouseLeave);

		return () => {
			mark.removeEventListener("mouseenter", handleMouseEnter);
			mark.removeEventListener("mouseleave", handleMouseLeave);
		};
	}, [mark]);

	return (
		<div
			onMouseEnter={() => mark.classList.add("hover")}
			onMouseLeave={() => mark.classList.remove("hover")}
			className={cn("omnidian-comment", {
				"right-full mr-8": position === "left",
				"left-full ml-8": position === "right",
			})}
			style={{
				backgroundColor: hover
					? annotation.color || "var(--text-highlight-bg)"
					: "transparent",
			}}
		>
			{effectiveType && (
				<div className="omnidian-comment__type">{effectiveType}</div>
			)}
			{annotation.threads.length ? (
				<div className="omnidian-comment-thread">
					{annotation.threads.map((thread, index) => (
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
			) : (
				<span>{annotation.body}</span>
			)}
		</div>
	);
}
