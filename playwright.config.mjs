import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  expect: {timeout:10000},
  workers: 1,
  use: {baseURL:'http://127.0.0.1:4173/SuzhouMap/', headless:true, actionTimeout:10000,
    launchOptions: process.platform==='win32' ? {channel:'msedge'} : {},
    trace:'retain-on-failure'},
  outputDir:'outputs/browser-results',
  reporter:'list',
  webServer:{command:'npm run preview:pages -- --port 4173',url:'http://127.0.0.1:4173/SuzhouMap/',reuseExistingServer:!process.env.CI,timeout:30000},
});
