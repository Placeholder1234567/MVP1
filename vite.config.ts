import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { readdir } from 'node:fs/promises';

export default defineConfig(({ mode }) => ({
	// PowerSync ships web workers and WASM (wa-sqlite); Vite must not pre-bundle it.
	optimizeDeps: { exclude: ['@powersync/web'] },
	worker: { format: 'es' },
	plugins: [
		{
			name: 'guad-offline-worker-assets',
			resolveId(id) {
				if (id === 'virtual:guad-worker-assets') return '\0guad-worker-assets';
			},
			async load(id) {
				if (id !== '\0guad-worker-assets') return;
				// Nested PowerSync worker chunks are emitted before the service-worker build,
				// but are absent from SvelteKit's top-level immutable manifest.
				const files = await readdir('.svelte-kit/output/client/_app/immutable/workers', {
					recursive: true
				});
				return `export default ${JSON.stringify(files.filter((path) => path.endsWith('.js')).map((path) => '/_app/immutable/workers/' + path.replaceAll('\\', '/')))};`;
			}
		},
		sveltekit({
			// SvelteKit 3 moved adapter-node's ORIGIN to this build-time option.
			// Set APP_ORIGIN for a canonical deployment origin or an HTTP local preview.
			paths: {
				origin:
					process.env.APP_ORIGIN ||
					loadEnv(mode, process.cwd(), 'APP_ORIGIN').APP_ORIGIN ||
					undefined
			},
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Node server for Cloud Run: the same image runs the web and worker services
			// (infrastructure.md §1).
			adapter: adapter(),
			// CSRF is checked in hooks.server.ts for every state-changing request
			// (any content type), except job and webhook routes, which verify a
			// Google OIDC token or an SNS signature. SvelteKit's own check only
			// covers form content types, and would reject AWS SNS webhooks
			// (text/plain, no Origin header), so it's turned off here.
			csrf: { trustedOrigins: ['*'] }
		})
	]
}));
