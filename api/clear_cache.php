<?php
header('Content-Type: text/plain');

if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "SUCCESS: PHP OPcache has been cleared!\n\n";
        echo "You can now close this tab and try capturing the network log from the main application again.";
    } else {
        echo "ERROR: opcache_reset() failed, but the function exists.";
    }
} else {
    echo "INFO: PHP OPcache does not appear to be enabled on your server. This may not be the cause of the issue, but it's good to rule it out.";
}
?>
