#!/bin/bash

echo "Removing old lightPOS deployment from XAMPP htdocs..."
sudo rm -rf /opt/lampp/htdocs/lightPOS

echo "Copying current lightPOS project to XAMPP htdocs..."
sudo cp -r /home/daniel/Documents/GitHub/lightPOS /opt/lampp/htdocs/

echo "Restarting XAMPP services..."
sudo /opt/lampp/lampp restart

echo "Setting permissions for the data directory..."
sudo chmod -R 777 /opt/lampp/htdocs/lightPOS/data

echo "Deployment to XAMPP complete."
