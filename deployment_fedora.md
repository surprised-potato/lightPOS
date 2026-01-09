# Deploying LightPOS on Fedora Server (XAMPP)

These instructions assume you have XAMPP installed at `/opt/lampp`.

## 1. Prerequisites

Ensure your Fedora server has the necessary tools:

```bash
sudo dnf update -y
sudo dnf install -y git rsync
```

## 2. Prepare the Deployment Directory

Navigate to where you want to download the source code (e.g., your home directory):

```bash
cd ~
```

## 3. Download/Update Source Code

**First time:**
```bash
git clone https://github.com/YOUR_USERNAME/lightPOS.git
cd lightPOS
```

**Updating existing:**
```bash
cd lightPOS
git pull origin main
```

## 4. Run the Deployment Script

Make the script executable and run it. You can specify the target directory if it's different from the default (`/opt/lampp/htdocs/lightposDev`).

```bash
chmod +x deploy_to_xampp.sh
./deploy_to_xampp.sh /opt/lampp/htdocs/lightposDev
```

## 5. Troubleshooting

*   **403 Forbidden:** If you see permission errors, ensure SELinux contexts are applied correctly. The script attempts this, but you can force it manually:
    `sudo chcon -R -t httpd_sys_rw_content_t /opt/lampp/htdocs/lightposDev`
*   **Database Locked:** If you get 500 errors regarding the DB, ensure the `data` folder is writable:
    `sudo chmod -R 777 /opt/lampp/htdocs/lightposDev/data`
    
    The deployment script now automatically stops XAMPP during deployment to release file locks. If you still encounter locks during normal operation, restart XAMPP:
    `sudo /opt/lampp/lampp restart`

*   **503 Service Unavailable (Restore Loop):**
    If the application is stuck in "Restore Mode", run the following command in your browser console (F12) or via curl to reset the server state:
    ```javascript
    fetch('api/router.php?action=reset_all', { method: 'POST' }).then(r => r.json()).then(console.log);
    ```

*   **Admin Permissions / Login Issues:**
    If you cannot log in after a fresh deployment or restore, force-reset the admin account:
    ```javascript
    fetch('api/router.php?action=fix_admin').then(r => r.json()).then(console.log);
    ```
    Then clear your browser cache/storage:
    `localStorage.clear(); window.location.reload();`