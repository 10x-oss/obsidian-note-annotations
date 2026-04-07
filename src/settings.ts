import { App, PluginSettingTab, Setting } from "obsidian";
import { ANNOTATION_TYPES } from "@/types";
import type OmnidianPlugin from "./main";

export class OmnidianSettingTab extends PluginSettingTab {
	plugin: OmnidianPlugin;

	constructor(app: App, plugin: OmnidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Expand selection")
			.setDesc(
				"Expand the highlight boundary to complete words. Hold Alt while selecting to bypass expansion.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.expandSelection)
					.onChange(async (value) => {
						this.plugin.settings.expandSelection = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Color options")
			.setDesc(
				document
					.createRange()
					.createContextualFragment(
						"Comma-separated list of <a href='https://147colors.com'>color names</a> shown in the popover picker.",
					),
			)
			.setClass("[&_textarea]:w-full")
			.addTextArea((toggle) =>
				toggle
					.setValue(this.plugin.settings.colors.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.colors = value
							.split(",")
							.map((color) => color.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default annotation type")
			.setDesc("Used as the default type in the annotation popover.")
			.addDropdown((dropdown) => {
				for (const type of ANNOTATION_TYPES) {
					dropdown.addOption(type, type);
				}

				dropdown
					.setValue(this.plugin.settings.defaultAnnotationType)
					.onChange(async (value) => {
						this.plugin.settings.defaultAnnotationType =
							value as (typeof ANNOTATION_TYPES)[number];
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Auto-assign IDs")
			.setDesc("Generate a stable ID for each new annotation.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoAssignIds)
					.onChange(async (value) => {
						this.plugin.settings.autoAssignIds = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show margin notes")
			.setDesc("Render annotation comments as side notes in Reading View.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showMarginNotes)
					.onChange(async (value) => {
						this.plugin.settings.showMarginNotes = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Thread display")
			.setDesc("Controls how threaded conversations render in the popover.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("inline", "Inline")
					.addOption("collapsed", "Collapsed")
					.setValue(this.plugin.settings.threadDisplay)
					.onChange(async (value) => {
						this.plugin.settings.threadDisplay = value as "inline" | "collapsed";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Outline display")
			.setDesc(
				"Choose whether the custom outline view shows only annotations or a mixed heading-plus-annotation outline.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("annotations", "Annotations only")
					.addOption("mixed", "Mixed outline")
					.setValue(this.plugin.settings.outlineDisplay)
					.onChange(async (value) => {
						this.plugin.settings.outlineDisplay =
							value as "annotations" | "mixed";
						await this.plugin.saveSettings();
					}),
			);
	}
}
