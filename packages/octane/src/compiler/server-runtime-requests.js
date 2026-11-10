/**
 * Client entries and the server twins a server build imports in their place.
 * The compiler rewrites compiled modules' imports and the bundler rewrites
 * plain ones; both read this table. It has no imports, so the browser compiler
 * can load it without the module lexer.
 */
export const SERVER_RUNTIME_REQUESTS = {
	octane: 'octane/server',
	'octane/signals/client': 'octane/signals/server',
	'octane/react': 'octane/react/server',
	'octane/data/octane': 'octane/data/octane/server',
};
