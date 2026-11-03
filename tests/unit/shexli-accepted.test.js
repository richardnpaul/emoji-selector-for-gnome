import { describe, expect, it } from 'vitest';

import { ACCEPTED_FINDINGS } from '../../scripts/lib/shexli-accepted.mjs';

// The findings of the review linter that were looked at and are fine. Changing this list is a review
// decision, so it is pinned here; `npm run shexli` fails when an entry is no longer reported.
describe('the accepted findings of the review linter', () => {
	it('are the clipboard access, which is the purpose of the extension, and the Shell 51 that shexli does not know', () => {
		expect(ACCEPTED_FINDINGS).toEqual([
			{
				rule_id: 'EGO-A-005',
				snippet: 'St.Clipboard.get_default()',
				reason:
					'Copying the chosen emoji to the clipboard is what the extension is for; reviewers are asked to look, and the description says so',
			},
			{
				rule_id: 'EGO-M-004',
				snippet: "shell-version=['45', '46', '47', '48', '49', '50', '51']",
				reason:
					'shexli 0.2 takes every major version above 50 for a future release, but GNOME Shell 51 is out (Fedora 45 ships 51.1) and is a supported target',
			},
		]);
	});
});
