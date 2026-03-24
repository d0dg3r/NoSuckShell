#!/bin/bash
set -e

echo "Starting NoSuckShell Project Validation..."

# Monorepo root checks
echo "Checking frontend dependencies and running tsc..."
npm run desktop:build

echo "Running Vitest (frontend) tests..."
npm run desktop:test

# Rust checks
echo "Checking Rust code..."
cd apps/desktop/src-tauri
cargo check
cargo test

echo "Validation complete! All checks passed."
