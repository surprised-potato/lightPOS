#!/bin/bash

# Accept target directory as argument, default to standard dev path
TARGET_DIR=${1:-/opt/lampp/htdocs/lightposDev}

echo "Deploying to: $TARGET_DIR"

echo "Removing old deployment..."
sudo rm -rf "$TARGET_DIR"

echo "Copying project files..."
sudo mkdir -p "$TARGET_DIR"
sudo rsync -av --exclude 'data/database.sqlite' --exclude '.git' --exclude 'node_modules' ./ "$TARGET_DIR/"

echo "Setting up WebAssembly..."
sudo cp "$TARGET_DIR/src/libs/sql.wasm" "$TARGET_DIR/src/libs/sql-wasm.wasm"

echo "Setting permissions..."
sudo mkdir -p "$TARGET_DIR/data"
sudo chmod -R 777 "$TARGET_DIR/data"

echo "Restarting XAMPP services..."
if [ -f "/opt/lampp/lampp" ]; then
    sudo /opt/lampp/lampp restart
else
    echo "XAMPP not found at /opt/lampp/lampp, skipping restart."
fi

echo "Deployment complete."
