#!/bin/bash

# Accept target directory as argument, default to standard dev path
TARGET_DIR=${1:-/opt/lampp/htdocs/lightposDev}

echo "Deploying to: $TARGET_DIR"

# Check if we need to preserve the existing database (if local one is missing)
if [ ! -f "./data/database.sqlite" ] && [ -f "$TARGET_DIR/data/database.sqlite" ]; then
    echo "Local database not found. Preserving existing server database..."
    sudo cp "$TARGET_DIR/data/database.sqlite" /tmp/lightpos_db_backup.sqlite
    RESTORE_DB=true
fi

echo "Removing old deployment..."
sudo rm -rf "$TARGET_DIR"

echo "Copying project files..."
sudo mkdir -p "$TARGET_DIR"
sudo rsync -av --exclude 'data/restore.lock' --exclude '.git' --exclude 'node_modules' ./ "$TARGET_DIR/"

echo "Setting up WebAssembly..."
sudo cp "$TARGET_DIR/src/libs/sql.wasm" "$TARGET_DIR/src/libs/sql-wasm.wasm"

echo "Setting permissions..."
sudo mkdir -p "$TARGET_DIR/data"
sudo chmod -R 777 "$TARGET_DIR/data"
# Ensure no stale lock file exists
sudo rm -f "$TARGET_DIR/data/restore.lock"

# Restore preserved database if applicable
if [ "$RESTORE_DB" = true ]; then
    echo "Restoring preserved database..."
    sudo mv /tmp/lightpos_db_backup.sqlite "$TARGET_DIR/data/database.sqlite"
    sudo chmod 777 "$TARGET_DIR/data/database.sqlite"
fi

echo "Restarting XAMPP services..."
if [ -f "/opt/lampp/lampp" ]; then
    sudo /opt/lampp/lampp restart
else
    echo "XAMPP not found at /opt/lampp/lampp, skipping restart."
fi

echo "Deployment complete."
