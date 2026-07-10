import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const clientModules = {
	react: 'shim.ts',
	'react/jsx-runtime': 'jsx-runtime.ts',
	'react/jsx-dev-runtime': 'jsx-runtime.ts',
	'react-dom': 'dom.ts',
	'react-dom/client': 'dom.ts',
	'react-dom/test-utils': 'test-utils.ts',
	'react-dom/server': 'server-renderer.ts',
	'react-dom/server.browser': 'server-renderer.ts',
	'react-dom/server.node': 'server-renderer.ts',
	'use-sync-external-store': 'use-sync-external-store.ts',
	'use-sync-external-store/shim': 'use-sync-external-store.ts',
	'use-sync-external-store/with-selector': 'use-sync-external-store-with-selector.ts',
	'use-sync-external-store/with-selector.js': 'use-sync-external-store-with-selector.ts',
};

const serverModules = {
	react: 'server-shim.ts',
	'react/jsx-runtime': 'server-jsx-runtime.ts',
	'react/jsx-dev-runtime': 'server-jsx-runtime.ts',
	'react-dom': 'server-dom.ts',
	'react-dom/server': 'server-renderer.ts',
	'react-dom/server.browser': 'server-renderer.ts',
	'react-dom/server.node': 'server-renderer.ts',
	'use-sync-external-store': 'server-use-sync-external-store.ts',
	'use-sync-external-store/shim': 'server-use-sync-external-store.ts',
	'use-sync-external-store/with-selector': 'server-use-sync-external-store-with-selector.ts',
	'use-sync-external-store/with-selector.js': 'server-use-sync-external-store-with-selector.ts',
};

const clientAliases = {
	react: '@octanejs/react-compat',
	'react/jsx-runtime': '@octanejs/react-compat/jsx-runtime',
	'react/jsx-dev-runtime': '@octanejs/react-compat/jsx-dev-runtime',
	'react-dom': '@octanejs/react-compat/dom',
	'react-dom/client': '@octanejs/react-compat/client',
	'react-dom/test-utils': '@octanejs/react-compat/test-utils',
	'react-dom/server': '@octanejs/react-compat/server-renderer',
	'react-dom/server.browser': '@octanejs/react-compat/server-renderer',
	'react-dom/server.node': '@octanejs/react-compat/server-renderer',
	'use-sync-external-store': '@octanejs/react-compat/use-sync-external-store',
	'use-sync-external-store/shim': '@octanejs/react-compat/use-sync-external-store',
	'use-sync-external-store/with-selector':
		'@octanejs/react-compat/use-sync-external-store/with-selector',
	'use-sync-external-store/with-selector.js':
		'@octanejs/react-compat/use-sync-external-store/with-selector',
};

const serverAliases = {
	react: '@octanejs/react-compat/server',
	'react/jsx-runtime': '@octanejs/react-compat/server-jsx-runtime',
	'react/jsx-dev-runtime': '@octanejs/react-compat/server-jsx-runtime',
	'react-dom': '@octanejs/react-compat/server-dom',
	'react-dom/server': '@octanejs/react-compat/server-renderer',
	'react-dom/server.browser': '@octanejs/react-compat/server-renderer',
	'react-dom/server.node': '@octanejs/react-compat/server-renderer',
	'use-sync-external-store': '@octanejs/react-compat/server-use-sync-external-store',
	'use-sync-external-store/shim': '@octanejs/react-compat/server-use-sync-external-store',
	'use-sync-external-store/with-selector':
		'@octanejs/react-compat/server-use-sync-external-store/with-selector',
	'use-sync-external-store/with-selector.js':
		'@octanejs/react-compat/server-use-sync-external-store/with-selector',
};

function exactAlias(aliases) {
	return Object.entries(aliases).map(([find, replacement]) => ({
		find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
		replacement,
	}));
}

export function react(options = {}) {
	const runtime = options.runtime ?? 'auto';
	const noExternal = options.noExternal ?? true;
	return {
		name: 'octane:react-compat',
		enforce: 'pre',
		resolveId(source, _importer, resolveOptions) {
			const server =
				runtime === 'server' ||
				(runtime === 'auto' &&
					(resolveOptions?.ssr === true || this.environment?.config.consumer === 'server'));
			const map = server ? serverModules : clientModules;
			const target = map[source];
			return target === undefined ? null : here + target;
		},
		configEnvironment(_name, config) {
			const server = runtime === 'server' || (runtime === 'auto' && config.consumer === 'server');
			return {
				resolve: { alias: exactAlias(server ? serverAliases : clientAliases) },
				optimizeDeps: { exclude: ['@octanejs/react-compat', 'octane'] },
			};
		},
		config() {
			return {
				resolve: {
					dedupe: ['@octanejs/react-compat', 'octane'],
					conditions: ['octane', 'module', 'browser', 'development|production'],
				},
				ssr: {
					noExternal,
					resolve: {
						conditions: ['octane', 'module', 'node', 'development|production'],
					},
				},
			};
		},
	};
}

export const reactCompat = react;

export default react;
