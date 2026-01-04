const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost/lightPOS',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
});