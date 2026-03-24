#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$REPO_ROOT"

echo "Starting NoSuckShell Project Validation (repo root: $REPO_ROOT)..."

# Monorepo root checks
echo "Checking frontend dependencies and running tsc..."
npm run desktop:build

echo "Running Vitest (frontend) tests..."
npm run desktop:test

# Rust checks
echo "Checking Rust code..."
cd "$REPO_ROOT/apps/desktop/src-tauri"
cargo check
cargo test

echo "Validation complete! All checks passed."
