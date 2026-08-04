import { defineConfig } from 'astro/config';
import octane from '@octanejs/astro';

export default defineConfig({
	integrations: [octane()],
});
