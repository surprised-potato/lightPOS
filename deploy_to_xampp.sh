#!/bin/bash

echo "Removing old lightPOS deployment from XAMPP htdocs..."
sudo rm -rf /opt/lampp/htdocs/lightposDev

echo "Copying current lightPOS project to XAMPP htdocs (excluding database.sqlite)..."
sudo rsync -av --exclude 'data/database.sqlite' /home/daniel/Documents/GitHub/lightPOS/ /opt/lampp/htdocs/lightposDev/

echo "Copying and renaming sql.wasm to sql-wasm.wasm..."
sudo cp /opt/lampp/htdocs/lightposDev/src/libs/sql.wasm /opt/lampp/htdocs/lightposDev/src/libs/sql-wasm.wasm

echo "Restarting XAMPP services..."
sudo /opt/lampp/lampp restart

echo "Setting permissions for the data directory..."
sudo chmod -R 777 /opt/lampp/htdocs/lightposDev/data

echo "Deployment to XAMPP complete."
