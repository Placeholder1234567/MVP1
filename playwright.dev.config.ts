import { defineConfig } from '@playwright/test';
import production from './playwright.config';

// Same isolated, loopback-only harness, with a real development build for dev-only UI.
export default defineConfig({
	...production,
	testDir: './tests/e2e-dev',
	outputDir: 'test-results-dev',
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-dev' }]],
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
		url: 'http://127.0.0.1:4175/login',
		env: { HOST: '127.0.0.1', PORT: '4175', BODY_SIZE_LIMIT: '4M' },
		reuseExistingServer: false,
		timeout: 120000
	}
});
