// The tests that run the extension in the real GNOME (`*.real.test.js`): its preferences in real GTK 4 and
// libadwaita under Xvfb, and the built extension in a real, headless GNOME Shell. They need the dev
// container's toolchain, take about a minute, and add no coverage: `npm run test:real` runs them, and
// the CI job `real-gnome` does too. The default configuration (and so `npm run check`) leaves them out.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.real.test.js'],
		// A Shell takes a while to start and to be driven.
		testTimeout: 300_000,
		hookTimeout: 300_000,
	},
});
