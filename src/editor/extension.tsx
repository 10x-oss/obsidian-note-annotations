import {
	Decoration,
	EditorView,
	type DecorationSet,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import {
	EditorState,
	type Extension,
	type Range,
	StateEffect,
	StateField,
} from "@codemirror/state";
import { createRoot } from "react-dom/client";
import { editorLivePreviewField } from "obsidian";
import type OmnidianPlugin from "@/main";
import {
	extractAnnotations,
	getAnnotationTooltip,
	getEffectiveAnnotationType,
} from "@/lib/parser";
import {
	normalizeAnnotationDraft,
	serializeAnnotation,
} from "@/lib/serializer";
import type { Annotation, AnnotationDraft } from "@/types";
import CommentPopover from "./popover";

const popoverContainerEl = document.createElement("div");
popoverContainerEl.setAttribute("popover", "auto");
popoverContainerEl.setAttribute("id", "omnidian-comment-popover-container");
document.body.appendChild(popoverContainerEl);
const root = createRoot(popoverContainerEl);

const ShowPopoverEffect = StateEffect.define<{ from: number; to: number }>();

abstract class AnnotationWidget extends WidgetType {
	protected anchorEl: HTMLElement | null = null;

	constructor(
		protected annotation: Annotation,
		protected plugin: OmnidianPlugin,
	) {
		super();
	}

	eq(other: AnnotationWidget) {
		return serializeAnnotation(this.annotation) === serializeAnnotation(other.annotation);
	}

	showPopover(view: EditorView) {
		if (!this.anchorEl) {
			return;
		}

		root.render(
			<CommentPopover
				annotation={this.annotation}
				className="omnidian-comment-popover"
				colorOptions={this.plugin.settings.colors}
				defaultType={this.plugin.settings.defaultAnnotationType}
				threadDisplay={this.plugin.settings.threadDisplay}
				onClose={hidePopover}
				onExtract={() => {
					void this.plugin.extractAnnotationToFile(this.annotation);
					hidePopover();
				}}
				onRemove={() => this.removeAnnotation(view)}
				onSave={(draft) => this.saveAnnotation(view, draft)}
			/>,
		);

		positionPopover(this.anchorEl);
		popoverContainerEl.showPopover();
	}

	protected applySharedAttributes(element: HTMLElement) {
		const effectiveType = getEffectiveAnnotationType(this.annotation);

		element.setAttribute(
			"title",
			getAnnotationTooltip(this.annotation) || this.annotation.highlightText,
		);

		if (this.annotation.id) {
			element.dataset["annotationId"] = this.annotation.id;
		}

		if (effectiveType) {
			element.dataset["annotationType"] = effectiveType;
			element.classList.add(`type-${effectiveType}`);
		}

		if (this.annotation.body.trim()) {
			element.classList.add("has-comment");
		}

		if (this.annotation.color) {
			element.classList.add("has-color");
			element.style.backgroundColor = this.annotation.color;
		}
	}

	protected removeAnnotation(view: EditorView) {
		view.dispatch(
			view.state.update({
				changes: {
					from: this.annotation.from,
					to: this.annotation.to,
					insert: this.annotation.highlightText,
				},
			}),
		);
	}

	protected saveAnnotation(view: EditorView, draft: AnnotationDraft) {
		const nextAnnotation = normalizeAnnotationDraft({
			...this.annotation,
			...draft,
		});

		const insert = serializeAnnotation(nextAnnotation);

		view.dispatch(
			view.state.update({
				changes: {
					from: this.annotation.from,
					to: this.annotation.to,
					insert,
				},
			}),
		);
	}
}

class InlineAnnotationWidget extends AnnotationWidget {
	toDOM(view: EditorView) {
		const wrapper = document.createElement("span");
		this.anchorEl = wrapper;
		wrapper.className = "omnidian-highlight";
		wrapper.textContent = this.annotation.highlightText;
		this.applySharedAttributes(wrapper);
		wrapper.addEventListener("click", () => this.showPopover(view));

		return wrapper;
	}
}

class BlockAnnotationWidget extends AnnotationWidget {
	toDOM(view: EditorView) {
		const wrapper = document.createElement("div");
		const header = wrapper.createDiv({
			cls: "omnidian-block-annotation__header",
		});
		const highlight = wrapper.createDiv({
			cls: "omnidian-block-annotation__highlight",
			text: this.annotation.highlightText,
		});
		const body = wrapper.createDiv({
			cls: "omnidian-block-annotation__body",
		});

		this.anchorEl = wrapper;
		wrapper.className = "omnidian-block-annotation";
		this.applySharedAttributes(wrapper);

		header.setText(
			[
				getEffectiveAnnotationType(this.annotation) ?? "annotation",
				this.annotation.id ?? "legacy",
			].join(" • "),
		);
		body.setText(this.annotation.body || "No comment yet.");

		for (const element of [wrapper, header, highlight, body]) {
			element.addEventListener("click", () => this.showPopover(view));
		}

		return wrapper;
	}
}

export function highlightExtension(plugin: OmnidianPlugin): Extension {
	const highlightField = StateField.define<DecorationSet>({
		create(state) {
			if (!state.field(editorLivePreviewField)) {
				return Decoration.none;
			}

			return createAnnotationDecorations(state, plugin);
		},
		update(decorations, transaction) {
			const isLivePreview = transaction.state.field(editorLivePreviewField);
			const wasLivePreview = transaction.startState.field(editorLivePreviewField);

			if (!isLivePreview || isLivePreview !== wasLivePreview) {
				if (!isLivePreview) {
					return Decoration.none;
				}

				return createAnnotationDecorations(transaction.state, plugin);
			}

			if (transaction.docChanged) {
				return createAnnotationDecorations(transaction.state, plugin);
			}

			return decorations.map(transaction.changes);
		},
		provide: (field) => EditorView.decorations.from(field),
	});

	const highlightPlugin = ViewPlugin.fromClass(
		class {
			update(update: ViewUpdate) {
				for (const transaction of update.transactions) {
					for (const effect of transaction.effects) {
						if (!effect.is(ShowPopoverEffect)) {
							continue;
						}

						const decorations = update.state.field(highlightField);
						decorations.between(effect.value.from, effect.value.to, (_, __, decoration) => {
							const widget = decoration.spec.widget as AnnotationWidget | undefined;

							if (!widget) {
								return;
							}

							setTimeout(() => widget.showPopover(update.view), 0);
						});
					}
				}
			}
		},
	);

	return [highlightField, highlightPlugin];
}

export function createInlineHighlight(
	view: EditorView,
	{ id }: { id: string | null },
) {
	const selection = view.state.selection.main;

	if (selection.empty) {
		return false;
	}

	const selectedText = view.state.doc.sliceString(selection.from, selection.to);
	const annotation: AnnotationDraft = {
		id,
		kind: "inline",
		type: null,
		body: "",
		color: null,
		highlightText: selectedText,
	};
	const insert = serializeAnnotation(annotation);

	view.dispatch(
		view.state.update({
			changes: {
				from: selection.from,
				to: selection.to,
				insert,
			},
			effects: [
				ShowPopoverEffect.of({
					from: selection.from,
					to: selection.from + insert.length,
				}),
			],
		}),
	);

	return true;
}

export function createBlockAnnotation(
	view: EditorView,
	{ id }: { id: string | null },
) {
	const selection = view.state.selection.main;

	if (selection.empty) {
		return false;
	}

	const selectedText = view.state.doc.sliceString(selection.from, selection.to);
	const annotation: AnnotationDraft = {
		id,
		kind: "block",
		type: null,
		body: "",
		color: null,
		highlightText: selectedText,
	};
	const insert = serializeAnnotation(annotation);

	view.dispatch(
		view.state.update({
			changes: {
				from: selection.from,
				to: selection.to,
				insert,
			},
			effects: [
				ShowPopoverEffect.of({
					from: selection.from,
					to: selection.from + insert.length,
				}),
			],
		}),
	);

	return true;
}

export function cleanup() {
	root.unmount();
	popoverContainerEl.remove();
}

function createAnnotationDecorations(state: EditorState, plugin: OmnidianPlugin) {
	const annotations = extractAnnotations(state.doc.toString());
	const decorations: Range<Decoration>[] = [];

	for (const annotation of annotations) {
		const widget =
			annotation.kind === "block"
				? new BlockAnnotationWidget(annotation, plugin)
				: new InlineAnnotationWidget(annotation, plugin);

		decorations.push(
			Decoration.replace({
				block: annotation.kind === "block",
				widget,
			}).range(annotation.from, annotation.to),
		);
	}

	return Decoration.set(decorations, true);
}

function positionPopover(anchorEl: HTMLElement) {
	const popover = getPopover();

	if (!popover) {
		return;
	}

	const rect = anchorEl.getBoundingClientRect();
	const popoverRect = popover.getBoundingClientRect();
	const centerOffset = (rect.width - popoverRect.width) / 2;

	popover.style.top = `${rect.bottom + window.scrollY + 10}px`;
	popover.style.left = `${Math.max(16, rect.left + window.scrollX + centerOffset)}px`;

	if (rect.left + popoverRect.width > window.innerWidth - 16) {
		popover.style.left = `${window.innerWidth - popoverRect.width - 16}px`;
	}
}

function getPopover() {
	return document.getElementById("omnidian-comment-popover-container");
}

function hidePopover() {
	getPopover()?.hidePopover();
}
