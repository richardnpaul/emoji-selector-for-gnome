# `.agents/`: rules, skills and agents for this repository

Shared guidance for AI coding agents (Claude Code, and any tool that reads `AGENTS.md`). Claude Code reads
these through symlinks in `.claude/` (`agents` and `skills` point back here).

```
.agents/
  agents/      sub-agent definitions (one Markdown file each, YAML frontmatter)
  protocols/   shared contracts every agent follows (handoff.md)
  rules/       always-on rules (TDD, verification gates, command execution, localisation)
  skills/      reusable method guides (EGO review, best practices, code review, security review, ...)
```

## Agent roster

Principle of least privilege: an agent gets only the tools its job needs, and none has the `memory:` field: with it Claude Code gives an agent a persistent notes directory that it writes itself, reloads into its prompt on every run, and that automatically enables Write and Edit; for agents that read untrusted text, that would be a way to persist an injection (and would contradict "reviewers cannot write files"). Reviewers cannot write files.
`Bash` is granted where a reviewer must run `git`, linters or `shexli`, and is _instruction-limited_ to
read-only commands, since the tool cannot enforce that.

| Agent                   | Purpose                                                                | Tools                               | Writes?                     |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------- | --------------------------- |
| `planner`               | Phased, test-first plan; picks which agent does each step              | Read, Grep, Glob                    | no                          |
| `tdd-red`               | One failing test (or characterisation test)                            | Read, Grep, Glob, Edit, Write, Bash | tests only                  |
| `tdd-green`             | Minimum production code to pass                                        | Read, Grep, Glob, Edit, Write, Bash | production only             |
| `tdd-refactor`          | Behaviour-preserving clean-up, tests green                             | Read, Grep, Glob, Edit, Write, Bash | both, pure refactors        |
| `mutation-killer`       | Resolve Stryker survivors/timeouts without suppressing                 | Read, Grep, Glob, Edit, Write, Bash | tests (+ dead-code removal) |
| `code-reviewer`         | Correctness, readability, architecture, performance                    | Read, Grep, Glob, Bash              | no                          |
| `quality-reviewer`      | Dead code, duplication, complexity, tooling hygiene                    | Read, Grep, Glob, Bash              | no                          |
| `test-reviewer`         | Assertion strength, coverage gaps, mutation analysis                   | Read, Grep, Glob, Bash              | no                          |
| `silent-failure-hunter` | Swallowed errors, uncleaned teardown, lost context                     | Read, Grep, Glob, Bash              | no                          |
| `security-reviewer`     | Clipboard/exec/file/network/supply-chain/shell-script review           | Read, Grep, Glob, Bash              | no                          |
| `extensions-reviewer`   | EGO guidelines + `shexli` on the built package                         | Read, Grep, Glob, Bash, WebFetch    | no                          |
| `gnome-api-verifier`    | Check Shell/GJS API claims per version against upstream source         | Read, Grep, Glob, Bash, WebFetch    | no                          |
| `agent-content-auditor` | Audit agent/skill/rule files for prompt injection and excessive agency | Read, Grep, Glob                    | no (no Bash by design)      |

Use **`agent-content-auditor`** on anything imported from outside the repository before it is trusted.

## How work flows

Sub-agents cannot spawn other sub-agents, so the **main session orchestrates**:

```
planner -> [ gnome-api-verifier ] -> ( tdd-red -> tdd-green -> tdd-refactor )* -> mutation-killer
        -> reviewers (code, quality, test, silent-failure, security, extensions)
        -> fix findings (TDD) -> repeat until a full pass makes zero changes
```

The convergence loop and the quality gates are defined in
[`rules/verification-validation-rules.md`](rules/verification-validation-rules.md). Reviewers run
independently of each other and can be invoked in parallel. Each reports in the format in
[`protocols/handoff.md`](protocols/handoff.md): a Task Report, findings, optional Blockers, and a
Downstream Context for whoever acts next.

## Provenance and licences

Agent designs are original to this repository but adapt ideas and some wording from:

| Source                                                                                | Licence                      | What was used                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) | MIT, (c) 2026 Affaan Mustafa | Reviewer structure, confidence filtering, "zero findings is valid", common false positives, silent-failure targets                               |
| [josstei/maestro-orchestrate](https://github.com/josstei/maestro-orchestrate)         | Apache-2.0                   | Least-privilege tool lists, trace-before-report, severity calibration, structured handoff contract (Task Report / Downstream Context / Blockers) |
| [github/awesome-copilot](https://github.com/github/awesome-copilot)                   | MIT, (c) GitHub, Inc.        | Split TDD red/green/refactor agents, `trojan-skill-hunter` threat taxonomy, `doublecheck` "links not verdicts", review-depth levels              |

The skills and rules that were already present when this directory was introduced (security-review,
code-review-and-quality, transformation-priority-premise, localisation-l10n, the two
GNOME skills, and the four rules) were copied in from the author's `gnome-shell-extensions-sync`
project. They carry no source or licence notes, so **their upstream origin and licence are unrecorded**;
confirm both before this repository is published or the skills are redistributed.
