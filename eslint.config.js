import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

// Import boundaries from constitution principle 15. They keep the single
// SvelteKit app splittable into a monorepo later by moving folders.
const DOMAIN = {
	files: ['src/lib/domain/**/*.ts'],
	rules: {
		'no-restricted-imports': [
			'error',
			{
				patterns: [
					{
						regex: '^(?!\\./)',
						message:
							'src/lib/domain/ is pure business rules: it may only import files from src/lib/domain/ (constitution principle 15).'
					}
				]
			}
		],
		'no-restricted-globals': [
			'error',
			...[
				'window',
				'document',
				'navigator',
				'localStorage',
				'sessionStorage',
				'fetch',
				'process'
			].map((name) => ({
				name,
				message: 'src/lib/domain/ must run unchanged on the device and the server.'
			}))
		]
	}
};

const SERVICE_INTERNALS = {
	regex: '(^|/)services/[^/]+/(?!index(\\.ts)?$)[^/]+$',
	message: 'Import a service only through its index.ts (constitution principle 15).'
};
const SIBLING_SERVICE_INTERNALS = {
	// '../other-service/file' (not '../../db', which every service may use)
	regex: '^\\.\\./(?!\\.\\.)[^/]+/(?!index(\\.ts)?$)[^/]+$',
	message: 'Import another service only through its index.ts (constitution principle 15).'
};
const DB_DRIVERS = {
	regex: '^(pg|drizzle-orm/node-postgres.*)$',
	message: 'Database connections live only in src/lib/server/db/ (constitution principle 15).'
};

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'mvp/',
			'.specify/',
			'drizzle/',
			'scripts/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser } }
	},
	DOMAIN,
	{
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/domain/**', 'src/lib/server/services/**', 'src/lib/server/db/**'],
		rules: { 'no-restricted-imports': ['error', { patterns: [SERVICE_INTERNALS, DB_DRIVERS] }] }
	},
	{
		files: ['src/lib/server/services/**/*.ts'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [SIBLING_SERVICE_INTERNALS, DB_DRIVERS] }]
		}
	},
	{
		files: ['src/lib/server/jobs/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						SERVICE_INTERNALS,
						DB_DRIVERS,
						{
							regex: '(\\.svelte$|(^|/)routes/|(^|/)components/|^\\$app/)',
							message:
								'Job handlers call services, never UI code or routes (constitution principle 15).'
						}
					]
				}
			]
		}
	}
);
