#!/bin/bash
# Continuous Learning - Session Evaluator for Antigravity & AI Agents
# Evaluates agent session transcripts to extract reusable patterns and save as learned skills
#
# Patterns to detect: error_resolution, debugging_techniques, workarounds, project_specific conventions
# Patterns to ignore: simple_typos, one_time_fixes, external_api_issues
# Extracted skills saved to: .agents/skills/learned/ or ~/.gemini/config/skills/learned/

set -o errexit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LEARNED_SKILLS_PATH="${WORKSPACE_ROOT}/.agents/skills/learned"
MIN_SESSION_LENGTH=10

# Load config if exists
if [ -f "$CONFIG_FILE" ]; then
	MIN_SESSION_LENGTH=$(jq -r '.min_session_length // 10' "$CONFIG_FILE")
	CONFIG_PATH=$(jq -r '.learned_skills_path // ""' "$CONFIG_FILE")
	if [ -n "$CONFIG_PATH" ]; then
		LEARNED_SKILLS_PATH=${CONFIG_PATH/\~/$HOME}
	fi
fi

# Ensure learned skills directory exists
mkdir -p "$LEARNED_SKILLS_PATH"

# Resolve transcript path
transcript_path="${TRANSCRIPT_PATH:-}"

if [ -z "$transcript_path" ]; then
	# Search for the latest Antigravity transcript
	latest_transcript=$(find "${HOME}/.gemini/antigravity-ide/brain" -name "transcript.jsonl" -type f -print0 2>/dev/null | xargs -0 -r ls -t 2>/dev/null | head -n 1 || true)
	if [ -n "$latest_transcript" ] && [ -f "$latest_transcript" ]; then
		transcript_path="$latest_transcript"
	fi
fi

if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
	exit 0
fi

# Count user messages (Antigravity format: "USER_INPUT", fallback: "user")
message_count=$(grep -c -E '"type":"(USER_INPUT|user)"' "$transcript_path" 2>/dev/null || echo "0")

# Skip short sessions
if [ "$message_count" -lt "$MIN_SESSION_LENGTH" ]; then
	echo "[ContinuousLearning] Session too short ($message_count user messages), skipping evaluation" >&2
	exit 0
fi

# Signal that session should be evaluated for extractable patterns
echo "[ContinuousLearning] Session has $message_count messages - evaluate for extractable patterns" >&2
echo "[ContinuousLearning] Save learned skills to: $LEARNED_SKILLS_PATH" >&2
