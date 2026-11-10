import { defineConfig } from '@octanejs/app-core/config';
import { threeRenderers } from '@octanejs/three/config';

export default defineConfig({
	compiler: {
		strong: true,
		// Every Octane package the site renders must compile under Strong mode.
		strongDependencies: { require: true, allow: [] },
		renderers: threeRenderers,
	},
});
