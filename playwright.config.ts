import { defineConfig } from '@playwright/test';

if (process.env.GUAD_E2E !== '1') throw new Error('Run browser tests through npm run test:e2e.');

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 120000,
	expect: { timeout: 45000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: !!process.env.CI,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: 'http://127.0.0.1:4175',
		browserName: 'chromium',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
		{
			name: 'phone',
			use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
		}
	],
	webServer: {
		command: 'node --env-file=.env build/index.js',
		url: 'http://127.0.0.1:4175/login',
		// BODY_SIZE_LIMIT as deployed (deploy.sh), for board photos.
		env: { HOST: '127.0.0.1', PORT: '4175', BODY_SIZE_LIMIT: '4M' },
		reuseExistingServer: false,
		timeout: 120000
	}
});
