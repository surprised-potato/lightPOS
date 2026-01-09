# Deploying lightPOS to XAMPP

This document provides instructions on how to deploy the lightPOS application to your XAMPP server.

## 1. Remove the old version (if it exists)

Before copying the new files, it's a good practice to remove the old version to avoid any conflicts.

Open a terminal and run the following command. You might be prompted for your password.

```bash
sudo rm -rf /opt/lampp/htdocs/lightPOS
```

**Note:** This command will permanently delete the `/opt/lampp/htdocs/lightPOS` directory. Make sure you have a backup if you have any important changes there.

## 2. Copy the new version

Now, copy the entire project directory to the XAMPP `htdocs` folder.

```bash
sudo cp -r /home/daniel/Documents/GitHub/lightPOS /opt/lampp/htdocs/
```

This command copies the project from your current location to the XAMPP webroot.

## 3. Restart XAMPP

After copying the files, you need to restart your XAMPP server for the changes to take effect.

```bash
sudo /opt/lampp/lampp restart
```

## 4. Access the application

You should now be able to access the application by navigating to `http://localhost/lightPOS` in your web browser.
