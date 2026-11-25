#!/usr/bin/env bash
# Copies the skills Omniflow needs into <repo>/.cursor/skills/ so Cursor Cloud Agents can load them.
# It never runs git add/commit: review the diff and ship it in a normal PR.
#
# Usage: sync-skills.sh <repo-path> [--full | --all] [--backend] [--auth] [--sql] [--i18n] [--web] [--rn] [--finitless-brand] [--dry-run]
#   (no mode)         the 7 skills every Cloud phase needs, plus the manual flags given.
#   --full            the 7, plus what a Cloud phase can use for the stack detected in the repo.
#   --all             every skill Omniflow references (local phases too), found by scanning its files.
#   --finitless-brand add finitless-brand-theming. Never added automatically: it would restyle Ordering surfaces.

set -euo pipefail

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[[ $# -ge 1 ]] || usage
repo="$1"
shift
[[ -d "$repo/.git" ]] || { echo "error: $repo is not a git repository" >&2; exit 1; }

required=(
  omniflow-developer
  test-driven-development
  clean-arquitecture-workflow
  verification-before-completion
  systematic-debugging
  code-review-excellence
  security-review
)
backend_skills=(error-handling-patterns auth-implementation-patterns sql-optimization-patterns)
web_skills=(frontend-design accessibility-compliance)
rn_skills=(react-native-design accessibility-compliance)
i18n_skills=(translate-keys)

optional=()
mode=""
dry_run=""
brand=""

add() { optional+=("$@"); }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) mode=full ;;
    --all) mode=all ;;
    --backend) add "${backend_skills[@]}" ;;
    --auth) add auth-implementation-patterns error-handling-patterns ;;
    --sql) add sql-optimization-patterns ;;
    --i18n) add "${i18n_skills[@]}" ;;
    --web) add "${web_skills[@]}" ;;
    --rn) add "${rn_skills[@]}" ;;
    --finitless-brand) brand=1 ;;
    --dry-run) dry_run="--dry-run" ;;
    *) usage ;;
  esac
  shift
done

self_dir="$(cd "$(dirname "$0")/.." && pwd)"
superpowers="$(ls -td "$HOME"/.cursor/plugins/cache/cursor-public/superpowers/*/skills 2>/dev/null | head -1 || true)"

resolve() {
  local name="$1"
  if [[ "$name" == omniflow-developer ]]; then
    echo "$self_dir"
    return
  fi
  local candidate
  for candidate in \
    "$HOME/.cursor/skills/$name" \
    "$HOME/.cursor/skills/.agents/skills/$name" \
    "$HOME/.agents/skills/$name" \
    "${superpowers:+$superpowers/$name}"; do
    if [[ -n "$candidate" && -f "$candidate/SKILL.md" ]]; then
      echo "$candidate"
      return
    fi
  done
}

has_dep() {
  [[ -f "$repo/package.json" ]] && grep -Eq "\"($1)\"[[:space:]]*:" "$repo/package.json"
}

detect_stack() {
  local found=()
  if [[ -f "$repo/composer.json" || -f "$repo/pyproject.toml" || -f "$repo/requirements.txt" ]]; then
    found+=(backend)
    add "${backend_skills[@]}"
  fi
  if has_dep 'react-native'; then
    found+=(react-native)
    add "${rn_skills[@]}"
  elif has_dep 'react|next|vue|svelte|astro'; then
    found+=(web)
    add "${web_skills[@]}"
  fi
  if has_dep 'i18next|react-i18next|react-intl|next-intl|vue-i18n|i18n-js' \
    || [[ -d "$repo/lang" || -d "$repo/resources/lang" ]] \
    || [[ -n "$(find "$repo" -maxdepth 4 -type d -name locales -not -path '*/node_modules/*' -print -quit 2>/dev/null)" ]]; then
    found+=(i18n)
    add "${i18n_skills[@]}"
  fi
  echo "Detected stack: ${found[*]:-none}"
}

case "$mode" in
  full) detect_stack ;;
  all)
    while IFS= read -r name; do
      [[ "$name" == finitless-brand-theming ]] && continue
      [[ -n "$(resolve "$name")" ]] && add "$name"
    done < <(grep -oh '`[a-z0-9-]*`' "$self_dir"/*.md | tr -d '`' | sort -u)
    add "${web_skills[@]}"
    ;;
esac
[[ -n "$brand" ]] && add finitless-brand-theming

dest="$repo/.cursor/skills"
mkdir -p "$dest"

missing=0
count=0
seen=" "
for name in "${required[@]}" "${optional[@]+"${optional[@]}"}"; do
  [[ "$seen" == *" $name "* ]] && continue
  seen+="$name "
  src="$(resolve "$name")"
  if [[ -z "$src" ]]; then
    echo "MISSING  $name"
    missing=1
    continue
  fi
  rsync -a --delete $dry_run --exclude '.DS_Store' --exclude '.git' "$src/" "$dest/$name/"
  echo "synced   $name  <-  $src"
  count=$((count + 1))
done

echo
echo "$count skills -> $dest"
echo "Next: review 'git -C $repo status' and ship .cursor/skills in a PR."
exit "$missing"
