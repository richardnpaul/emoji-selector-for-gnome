/** A file icon, which is all `Gio.icon_new_for_string(path)` is used for. */
export class FakeIcon {
	constructor(path) {
		this.path = path;
	}
}

/** The pages opened by `Gio.AppInfo.launch_default_for_uri`; set `failWith` to make it fail. */
export const launcher = {
	uris: [],
	failWith: null,
	reset() {
		this.uris = [];
		this.failWith = null;
	},
};

export default {
	icon_new_for_string: (path) => new FakeIcon(path),
	SettingsBindFlags: { DEFAULT: 0, GET: 2, SET: 4, NO_SENSITIVITY: 8, GET_NO_CHANGES: 16, INVERT_BOOLEAN: 32 },
	AppInfo: {
		launch_default_for_uri(uri, context) {
			if (launcher.failWith) {
				throw launcher.failWith;
			}
			launcher.uris.push({ uri, context });
			return true;
		},
	},
};
