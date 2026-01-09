#!/bin/bash

# Accept target directory as argument, default to standard dev path
TARGET_DIR=${1:-/opt/lampp/htdocs/lightposDev}
XAMPP_USER="daemon"
XAMPP_GROUP="daemon"

echo "Deploying to: $TARGET_DIR"

# Ensure rsync is installed (common issue on minimal Fedora installs)
if ! command -v rsync &> /dev/null; then
    echo "rsync not found. Attempting to install..."
    sudo dnf install -y rsync
fi

# Check if we need to preserve the existing database (if local one is missing)
if [ ! -f "./data/database.sqlite" ] && [ -f "$TARGET_DIR/data/database.sqlite" ]; then
    echo "Local database not found. Preserving existing server database..."
    sudo cp "$TARGET_DIR/data/database.sqlite" /tmp/lightpos_db_backup.sqlite
    RESTORE_DB=true
fi

echo "Syncing project files..."
sudo mkdir -p "$TARGET_DIR"

# Use rsync with --delete to make target match source exactly, but exclude git/node_modules
# We exclude database.sqlite from the delete phase so we don't wipe it before deciding to overwrite
sudo rsync -av --delete --exclude 'data/restore.lock' --exclude '.git' --exclude 'node_modules' ./ "$TARGET_DIR/"

echo "Setting up WebAssembly..."
sudo cp "$TARGET_DIR/src/libs/sql.wasm" "$TARGET_DIR/src/libs/sql-wasm.wasm"

echo "Configuring Permissions & Ownership..."
sudo mkdir -p "$TARGET_DIR/data"

# Set ownership to XAMPP default user (daemon)
sudo chown -R $XAMPP_USER:$XAMPP_GROUP "$TARGET_DIR"

# Set directory permissions (755 for folders, 644 for files)
sudo find "$TARGET_DIR" -type d -exec chmod 755 {} \;
sudo find "$TARGET_DIR" -type f -exec chmod 644 {} \;

# Data directory needs to be writable
sudo chmod -R 777 "$TARGET_DIR/data"

# Handle SELinux (Fedora specific)
if command -v getenforce &> /dev/null && [ "$(getenforce)" != "Disabled" ]; then
    echo "Applying SELinux contexts..."
    # Allow Apache to read/write content in the target directory
    sudo chcon -R -t httpd_sys_rw_content_t "$TARGET_DIR"
fi

# Ensure no stale lock file exists
sudo rm -f "$TARGET_DIR/data/restore.lock"

# Restore preserved database if applicable
if [ "$RESTORE_DB" = true ]; then
    echo "Restoring preserved database..."
    sudo mv /tmp/lightpos_db_backup.sqlite "$TARGET_DIR/data/database.sqlite"
    sudo chown $XAMPP_USER:$XAMPP_GROUP "$TARGET_DIR/data/database.sqlite"
    sudo chmod 777 "$TARGET_DIR/data/database.sqlite"
fi

echo "Restarting XAMPP services..."
if [ -f "/opt/lampp/lampp" ]; then
    sudo /opt/lampp/lampp restart
else
    echo "XAMPP not found at /opt/lampp/lampp, skipping restart."
fi

echo "Deployment complete."
