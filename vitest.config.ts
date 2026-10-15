import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so unit tests of plain TypeScript
// (domain rules, db helpers) don't need the SvelteKit plugin.
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
		environment: 'node'
	}
});
