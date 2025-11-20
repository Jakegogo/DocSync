#!/usr/bin/env bash
set -euo pipefail

# Simple build & optional deploy script for the Vault Folder Sync Obsidian plugin

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Building Vault Folder Sync plugin..."
cd "$ROOT"

# Install deps if node_modules is missing
if [ ! -d "$ROOT/node_modules" ]; then
  echo "node_modules not found, running npm install..."
  npm install
fi

npm run build --silent
echo "✔ Build finished (main.js, manifest.json)"

# Optional deployment when DEST is provided
if [ "${1-}" != "" ]; then
  DEST="$1"

  deploy_to_plugin_dir() {
    local plugin_dir="$1"
    echo "Installing plugin to: $plugin_dir"
    mkdir -p "$plugin_dir"
    cp -f "$ROOT/manifest.json" "$plugin_dir/"
    cp -f "$ROOT/main.js" "$plugin_dir/"
    cp -f "$ROOT/reverse-sync.js" "$plugin_dir/" 2>/dev/null || true
    echo "✔ Deployed: $plugin_dir"
  }

  echo "Deploying using DEST: $DEST"
  # Case 1: DEST is an Obsidian vault root (contains .obsidian)
  if [ -d "$DEST/.obsidian" ]; then
    PLUGIN_DIR="$DEST/.obsidian/plugins/vault-folder-sync"
    deploy_to_plugin_dir "$PLUGIN_DIR"
  # Case 2: DEST is already the plugin directory
  elif [[ "$DEST" == *".obsidian/plugins/vault-folder-sync"* ]]; then
    deploy_to_plugin_dir "$DEST"
  # Case 3: DEST looks like Obsidian Documents root containing multiple vaults
  elif [ -d "$DEST" ]; then
    echo "Scanning for vaults under: $DEST"
    shopt -s nullglob
    found_any=0
    for vault in "$DEST"/*; do
      if [ -d "$vault/.obsidian" ]; then
        found_any=1
        PLUGIN_DIR="$vault/.obsidian/plugins/vault-folder-sync"
        deploy_to_plugin_dir "$PLUGIN_DIR"
      fi
    done
    shopt -u nullglob
    if [ "$found_any" = "0" ]; then
      echo "No vaults found under: $DEST (expected subfolders with .obsidian)" >&2
      exit 1
    fi
  else
    echo "DEST does not exist: $DEST" >&2
    exit 1
  fi
fi


