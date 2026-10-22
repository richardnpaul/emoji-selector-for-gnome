---
name: continual-learning
description: Automatically extract reusable patterns from Antigravity sessions and save them as learned skills for future use.
---

# Continual Learning Skill

Automatically evaluates agent pair-programming sessions to extract reusable patterns and save them as learned skills.

## How It Works

This skill analyzes completed session transcripts to identify reusable patterns:

1. **Session Evaluation**: Checks if the session has enough interactions (default: 10+ user messages).
2. **Transcript Processing**: Inspects `transcript.jsonl` in `<appDataDir>/brain/<conversation-id>/.system_generated/logs/`.
3. **Pattern Detection**: Identifies extractable patterns (debugging fixes, tool configurations, shell workarounds).
4. **Skill Extraction**: Saves synthesized skills with frontmatter to `.agents/skills/learned/<skill-name>/SKILL.md` or global `~/.gemini/config/skills/learned/`.

## Configuration

Configured via `config.json`:

```json
{
  "min_session_length": 10,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "learned_skills_path": ".agents/skills/learned/",
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific"
  ],
  "ignore_patterns": ["simple_typos", "one_time_fixes", "external_api_issues"]
}
```

## Pattern Types

| Pattern                | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `error_resolution`     | How specific errors, test failures, or build issues were resolved           |
| `user_corrections`     | Key design preferences and corrections provided by the user                 |
| `workarounds`          | Solutions to environment quirks (e.g. shell formatting, typelib paths)      |
| `debugging_techniques` | Effective debugging approaches (e.g. GJS headless smoke tests)              |
| `project_specific`     | Repository conventions (e.g. gettext catalog generation, shexli compliance) |

## Slash Command Integration

When a reusable pattern or workflow is identified during a session, the user can invoke:

```sh
/learn
```

to persist the behavior into `.agents/skills/` or `~/.gemini/config/skills/`.
