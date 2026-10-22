---
trigger: always_on
---

# Command Execution and Terminal Rules

These rules govern how terminal commands are formulated and executed through the shell tool (`Bash` in Claude Code).

## 1. Never Send Multiline Strings in a Command

- You **MUST NOT** include raw newlines or multiline strings inside a single shell command.
- Specifically, **NEVER** use multiline `node -e "..."`, `python -c "..."`, or multiline Bash statements spanning multiple lines with unclosed quotes.
- **Why**: Raw newlines inside quotes trigger the shell's continuation prompt (`PS2`) and break terminal shell integration (e.g. VS Code `OSC 633` hooks), leaving the command hanging until someone types `exit $?`.

## 2. Use Scratch Scripts for Multi-Line Logic

- If logic requires multiple statements, JSON parsing (e.g. inspecting mutation reports), or file manipulation, you **MUST** write the code to a scratch file first using the `Write` tool, then execute it on a single line:
  ```bash
  node /path/to/scratch/script.js
  ```
- Write scratch files **outside the repository** (the session scratchpad, or `mktemp -d`), never into the tree. Remove them when done.
- Never use shell heredocs or `echo >`/`cat >` to create files with content: shell interpretation corrupts quotes, backticks and Markdown/YAML. Use `Write`/`Edit`.

## 3. Strict Single-Line Formatting for Inline Commands

- A quick inline command (`node -e`, `python3 -c`, `sed`, `awk`) **MUST** be strictly one line, using semicolons:
  ```bash
  # Correct:
  node -e "const fs = require('fs'); console.log(fs.existsSync('dist'));"

  # Incorrect (hangs the terminal):
  node -e "
  const fs = require('fs');
  console.log(fs.existsSync('dist'));
  "
  ```

## 4. Explicit Subshell Execution When Needed

- For compound commands where completion might be ambiguous, wrap in a non-interactive subshell:
  ```bash
  bash -c 'command1 && command2'
  ```

## 5. Never Idle on Hanging Background Tasks

- Commands expected to finish quickly (< 10 seconds) that are sent to the background must not be left unattended.
- If a short-running command has not completed within a reasonable window, inspect it, stop it if stalled, and investigate rather than waiting indefinitely.

## 6. Destructive and Privileged Commands

- Never run `rm -rf`, `git clean`, `git reset --hard`, `sudo`, or anything that writes outside the workspace without the user's explicit approval for that action.
- In shell scripts you write: `set -euo pipefail`, quote every expansion, and guard any `rm`/`mv`/`cp` that uses a variable (`${var:?}`).
- Never pipe a download into a shell (`curl … | sh`).
