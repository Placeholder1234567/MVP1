import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// PowerSync ships web workers and WASM (wa-sqlite); Vite must not pre-bundle it.
	optimizeDeps: { exclude: ['@powersync/web'] },
	worker: { format: 'es' },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Node server for Cloud Run: the same image runs the web and worker services
			// (infrastructure.md §1).
			adapter: adapter()
		})
	]
});
