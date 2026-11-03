import { extensionState } from '../shell-state.js';

/** What `ExtensionPreferences` offers a preferences window: the metadata, the settings and translations. */
export class ExtensionPreferences {
	constructor(metadata) {
		this.metadata = metadata;
	}

	get uuid() {
		return this.metadata.uuid;
	}

	getSettings() {
		return extensionState.settings;
	}
}

export const gettext = (text) => extensionState.translate(text);
