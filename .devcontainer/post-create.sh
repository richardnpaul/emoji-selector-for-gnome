#!/usr/bin/env bash
# Runs once after the dev container is created. Each step is skipped until the
# files it needs exist, so this works at every stage of the project.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f package-lock.json ]]; then
	npm ci
elif [[ -f package.json ]]; then
	npm install
fi

if [[ -f .pre-commit-config.yaml ]]; then
	# Installs the pre-commit and pre-push hooks (see default_install_hook_types in the config).
	pre-commit install --install-hooks
fi
