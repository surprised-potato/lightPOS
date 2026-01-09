<?php
/**
 * ProcurementApiTest.php
 * 
 * Verifies the API endpoints for the Procurement module.
 * Usage: php tests/api/ProcurementApiTest.php
 */

$baseUrl = 'http://localhost/lightPOS/api/procurement.php';
$localFile = __DIR__ . '/../../api/procurement.php';

if (!file_exists($localFile)) {
    echo "❌ Error: The file api/procurement.php does not exist at $localFile\n";
    exit(1);
}

echo "Running ProcurementApiTest...\n";
echo "Target URL: $baseUrl\n";

function makeRequest($url, $method = 'GET', $data = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $httpCode, 'body' => $response];
}

// 1. Test Recalculate (GET)
echo "1. Testing GET /recalculate...\n";
$res = makeRequest($baseUrl . '?action=recalculate');
if ($res['code'] == 404) {
    echo "❌ Failed: Endpoint not found (404). Check if the URL is correct and the web server is running.\n";
    exit(1);
}
// Expecting 200 OK and JSON
$json = json_decode($res['body'], true);
if ($res['code'] !== 200 || !isset($json['processed'])) {
    echo "❌ Failed: Expected 200 OK and 'processed' key. Got Code: " . $res['code'] . " Body: " . substr($res['body'], 0, 100) . "\n";
    exit(1);
}
echo "   ✅ Recalculate endpoint works.\n";

// 2. Test Alerts (GET)
echo "2. Testing GET /alerts...\n";
$res = makeRequest($baseUrl . '?action=alerts');
$json = json_decode($res['body'], true);
if ($res['code'] !== 200 || !is_array($json)) {
    echo "❌ Failed: Expected 200 OK and array. Got Code: " . $res['code'] . "\n";
    exit(1);
}
echo "   ✅ Alerts endpoint works.\n";

// 3. Test Suggested Order (GET)
echo "3. Testing GET /suggested-order...\n";
// Need a supplier ID. Assuming 'sup1' exists or we handle empty gracefully.
$res = makeRequest($baseUrl . '?action=suggested-order&supplier_id=sup1');
$json = json_decode($res['body'], true);
if ($res['code'] !== 200 || !isset($json['items'])) {
    echo "❌ Failed: Expected 200 OK and 'items' key. Got Code: " . $res['code'] . "\n";
    exit(1);
}
echo "   ✅ Suggested Order endpoint works.\n";

echo "🎉 ProcurementApiTest Passed!\n";
?>