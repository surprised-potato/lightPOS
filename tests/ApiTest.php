<?php

namespace Tests;

use PHPUnit\Framework\TestCase;

class ApiTest extends TestCase
{
    private string $baseUrl = 'http://localhost/lightPOS/api/router.php';

    private function makeRequest(string $method, array $params = [], ?array $data = null): array
    {
        $url = $this->baseUrl . '?' . http_build_query($params);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'code' => $httpCode,
            'data' => json_decode($response, true)
        ];
    }

    /**
     * Test reading and writing for all core entities defined in PRD
     * @dataProvider entityProvider
     */
    public function testEntityAccess(string $entity): void
    {
        // 1. Test Read (GET)
        $res = $this->makeRequest('GET', ['file' => $entity]);
        $this->assertEquals(200, $res['code'], "Failed to read entity: $entity");
        $this->assertIsArray($res['data'], "Data for $entity should be an array");

        // 2. Test Write (POST) - Round-trip verification
        $writeRes = $this->makeRequest('POST', ['file' => $entity], $res['data']);
        $this->assertEquals(200, $writeRes['code'], "Failed to write entity: $entity");
        $this->assertTrue($writeRes['data']['success'] ?? false);
    }

    public static function entityProvider(): array
    {
        return [
            ['items'],
            ['users'],
            ['suppliers'],
            ['customers'],
            ['transactions'],
            ['shifts'],
            ['expenses'],
            ['stock_in_history'],
            ['adjustments'],
            ['suspended_transactions'],
            ['returns'],
            ['settings'],
            ['last_sync'],
            ['stock_movements'],
            ['valuation_history']
        ];
    }

    public function testLoginAction(): void
    {
        $loginData = [
            'email' => 'admin@lightpos.com',
            'password' => 'admin' 
        ];
        $res = $this->makeRequest('POST', ['action' => 'login'], $loginData);
        
        $this->assertEquals(200, $res['code']);
        $this->assertTrue($res['data']['success'] ?? false);
    }
}