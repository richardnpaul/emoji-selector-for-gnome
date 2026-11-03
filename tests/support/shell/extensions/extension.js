import { extensionState } from '../../shell-state.js';

/** What `Extension` from the Shell offers an extension: its settings, location and translations. */
export class Extension {
	constructor(metadata) {
		this.metadata = metadata;
	}

	get uuid() {
		return this.metadata.uuid;
	}

	get path() {
		return extensionState.path;
	}

	getSettings() {
		return extensionState.settings;
	}
}

export const gettext = (text) => extensionState.translate(text);
export const ngettext = (singular, plural, n) => extensionState.translate(n === 1 ? singular : plural);
export const pgettext = (context, text) => extensionState.translate(text);
