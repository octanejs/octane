import { defineConfig } from '@octanejs/app-core/config';
import { threeRenderers } from '@octanejs/three/config';

export default defineConfig({
	compiler: { strong: true, renderers: threeRenderers },
});
