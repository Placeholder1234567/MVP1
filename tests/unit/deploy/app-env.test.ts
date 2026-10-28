// deploy.sh app_env: deploy/app.env.yaml settings replace the defaults, and
// an absent, empty or comments-only file leaves the defaults unchanged.
// gcloud's --env-vars-file keeps the first of two equal keys, so the output
// must never repeat a key. Synthetic values only; nothing is deployed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const script = readFileSync(join(root, 'deploy/deploy.sh'), 'utf8');
// The two functions, from app_defaults() up to deploy_app().
const functions = script.slice(
	script.indexOf('app_defaults() {'),
	script.indexOf('deploy_app() {')
);

function appEnv(extra?: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'guad-app-env-'));
	try {
		mkdirSync(join(dir, 'deploy'));
		writeFileSync(join(dir, 'deploy/app-env.awk'), readFileSync(join(root, 'deploy/app-env.awk')));
		if (extra !== undefined) writeFileSync(join(dir, 'deploy/app.env.yaml'), extra);
		return execFileSync('bash', ['-c', `${functions}\napp_env web sa@example.test`], {
			cwd: dir,
			encoding: 'utf8',
			env: {
				PATH: process.env.PATH,
				PROJECT: 'demo',
				WEB_URL: 'https://web.run.app',
				EXPORTS_BUCKET: 'demo-guad-exports',
				MEDIA_BUCKET: 'demo-guad-media'
			}
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function keys(env: string): string[] {
	return env
		.split('\n')
		.map((line) => /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line)?.[1])
		.filter((key): key is string => !!key);
}

function value(env: string, key: string): string | undefined {
	return new RegExp(`^${key}: "([^"]*)"$`, 'm').exec(env)?.[1];
}

describe('deploy.sh app_env', () => {
	it('writes the defaults when there is no deploy/app.env.yaml', () => {
		const env = appEnv();
		expect(value(env, 'GUAD_SERVICE')).toBe('web');
		expect(value(env, 'APP_URL')).toBe('https://web.run.app');
		expect(value(env, 'XFF_DEPTH')).toBe('1');
		// Report files: written by the worker, served by the web service.
		expect(value(env, 'EXPORTS_BUCKET')).toBe('demo-guad-exports');
		// Board photos: every web instance reads the same bucket.
		expect(value(env, 'MEDIA_BUCKET')).toBe('demo-guad-media');
		expect(keys(env).length).toBeGreaterThan(15);
	});

	it.each([
		['an empty', ''],
		['a comments-only', '# A custom domain\n# APP_URL: "https://app.example"\n'],
		['a blank-line', '\n\n']
	])('keeps every default for %s file', (_, extra) => {
		expect(keys(appEnv(extra))).toEqual(keys(appEnv()));
	});

	it('replaces overridden defaults and adds new settings, with no repeated key', () => {
		const defaults = keys(appEnv());
		const env = appEnv(
			'APP_URL: "https://app.example"\nXFF_DEPTH: "2"\nSES_FROM_ADDRESS: "Guad <no-reply@example.test>"'
		);
		expect(value(env, 'APP_URL')).toBe('https://app.example');
		expect(value(env, 'XFF_DEPTH')).toBe('2');
		expect(value(env, 'SES_FROM_ADDRESS')).toBe('Guad <no-reply@example.test>');
		expect(value(env, 'GUAD_SERVICE')).toBe('web');
		const merged = keys(env);
		expect(new Set(merged).size).toBe(merged.length);
		expect(merged.length).toBe(defaults.length + 1);
	});
});
