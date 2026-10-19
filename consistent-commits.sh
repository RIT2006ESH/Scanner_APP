#!/usr/bin/env bash
set -euo pipefail

# Check repository
git rev-parse --is-inside-work-tree >/dev/null

echo "Current branch: $(git branch --show-current)"
echo
git status --short

echo
echo "Stage your actual project changes..."
git add -u

# Include untracked files only if you have reviewed them.
echo
echo "Review staged changes before committing:"
git diff --cached --stat

echo
read -r -p "Commit these changes? (y/n): " answer

if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Cancelled. Your changes remain available."
    exit 0
fi

if git diff --cached --quiet; then
    echo "No staged changes to commit."
    exit 0
fi

git commit -m "chore: update scanner project"
echo
echo "Commit created. Push when ready with:"
echo "git push origin $(git branch --show-current)"
