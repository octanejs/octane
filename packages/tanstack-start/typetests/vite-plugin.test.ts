import {
	tanstackStart,
	type TanStackOctaneStartViteInputConfig,
} from '@octanejs/tanstack-start/plugin/vite';

const options = {
	compiled: true,
	client: { entry: './client' },
	server: { entry: './server' },
	octane: { hmr: false },
} satisfies TanStackOctaneStartViteInputConfig;

tanstackStart(options);
tanstackStart({
	// @ts-expect-error compiled is a build-time boolean selection
	compiled: 'true',
});
