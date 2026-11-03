// Findings of shexli (the extensions.gnome.org review linter) that were reviewed and are fine. An
// entry accepts one finding of one rule with exactly this evidence: if the code or the metadata it
// points at changes, the finding is reported again; and an entry that matches nothing fails the
// check, so this list only ever holds what is still true.
export const ACCEPTED_FINDINGS = [
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
];
