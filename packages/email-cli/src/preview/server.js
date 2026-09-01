import { createServer as createHttpServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { octane } from 'octane/compiler/vite';
import { createServer as createViteServer } from 'vite';
import { discoverTemplatePaths, isDirectory } from '../templates.js';

/** @typedef {{ directory?: string, host?: string, port?: number, logLevel?: 'error' | 'warn' | 'info' | 'silent' }} PreviewServerOptions */

/**
 * Start an Octane-native development server for `.tsrx` email templates.
 *
 * @param {PreviewServerOptions} [options]
 */
export async function startPreviewServer(options = {}) {
	const sourceDirectory = resolve(options.directory ?? './emails');
	if (!(await isDirectory(sourceDirectory))) {
		throw new Error(`Email directory does not exist: ${sourceDirectory}`);
	}

	const httpServer = createHttpServer();
	const vite = await createViteServer({
		root: sourceDirectory,
		configFile: false,
		appType: 'custom',
		logLevel: options.logLevel ?? 'info',
		plugins: [octane({ ssr: true })],
		server: {
			hmr: { server: httpServer },
			middlewareMode: true,
		},
	});
	/** @param {string} path */
	const reloadPreview = (path) => {
		if (!isPreviewFile(sourceDirectory, path)) return;
		vite.moduleGraph.invalidateAll();
		vite.ws.send({ type: 'full-reload' });
	};
	vite.watcher.on('add', reloadPreview);
	vite.watcher.on('change', reloadPreview);
	vite.watcher.on('unlink', reloadPreview);

	vite.middlewares.use(async (request, response, next) => {
		if (request.method !== 'GET' && request.method !== 'HEAD') return next();

		try {
			const url = new URL(request.url ?? '/', 'http://preview.local');
			if (url.pathname === '/') {
				const templates = await discoverTemplates(sourceDirectory);
				return sendHtml(response, 200, renderIndex(templates));
			}

			if (url.pathname.startsWith('/preview/')) {
				const requestedName = decodeURIComponent(url.pathname.slice('/preview/'.length));
				const templates = await discoverTemplates(sourceDirectory);
				const template = templates.find((entry) => entry.name === requestedName);
				if (!template) return sendHtml(response, 404, renderError('Template not found'));

				const emailModule = await vite.ssrLoadModule(template.sourcePath);
				if (typeof emailModule.default !== 'function') {
					throw new TypeError(`${template.relativePath} must default-export an email component`);
				}
				const emailLibrary = await vite.ssrLoadModule('@octanejs/email');
				if (typeof emailLibrary.render !== 'function') {
					throw new Error('@octanejs/email does not export render()');
				}
				const markup = await emailLibrary.render(emailModule.default);
				return sendHtml(response, 200, enableLiveReload(markup));
			}
		} catch (error) {
			vite.ssrFixStacktrace(/** @type {Error} */ (error));
			return sendHtml(response, 500, renderError(formatError(error)));
		}

		return next();
	});

	httpServer.on('request', (request, response) => {
		try {
			new URL(request.url ?? '/', 'http://preview.local');
		} catch (error) {
			return sendHtml(response, 500, renderError(formatError(error)));
		}
		vite.middlewares(request, response);
	});
	try {
		await new Promise((resolvePromise, reject) => {
			httpServer.once('error', reject);
			httpServer.listen(options.port ?? 3000, options.host ?? '127.0.0.1', () => {
				httpServer.off('error', reject);
				resolvePromise(undefined);
			});
		});
	} catch (error) {
		await vite.close();
		throw error;
	}

	const address = httpServer.address();
	if (!address || typeof address === 'string')
		throw new Error('Preview server did not bind to TCP');
	const advertisedHost = address.address === '::' ? 'localhost' : address.address;
	const url = `http://${advertisedHost.includes(':') ? `[${advertisedHost}]` : advertisedHost}:${address.port}/`;
	let closed = false;

	return {
		url,
		async close() {
			if (closed) return;
			closed = true;
			await vite.close();
			if (httpServer.listening) {
				await new Promise((resolvePromise, reject) =>
					httpServer.close((error) => (error ? reject(error) : resolvePromise(undefined))),
				);
			}
		},
	};
}

/** @param {string} directory */
async function discoverTemplates(directory, rootDirectory = directory) {
	return (await discoverTemplatePaths(directory))
		.map((sourcePath) => {
			const relativePath = relative(resolve(rootDirectory), sourcePath).split(sep).join('/');
			return { sourcePath, relativePath, name: relativePath.slice(0, -'.tsrx'.length) };
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

/** @param {import('node:http').ServerResponse} response @param {number} status @param {string} html */
function sendHtml(response, status, html) {
	response.statusCode = status;
	response.setHeader('Content-Type', 'text/html; charset=utf-8');
	response.end(html);
}

/** @param {{ name: string }[]} templates */
function renderIndex(templates) {
	const items = templates.length
		? templates
				.map(
					(template) =>
						`<li><a href="/preview/${encodeURI(template.name)}">${escapeHtml(template.name)}</a></li>`,
				)
				.join('')
		: '<li>No .tsrx email templates found.</li>';
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Octane Email Preview</title><style>body{font:16px system-ui;max-width:52rem;margin:3rem auto;padding:0 1.5rem;color:#18181b}a{color:#2563eb}li{margin:.75rem 0}</style></head><body><h1>Octane Email Preview</h1><ul>${items}</ul><script type="module" src="/@vite/client"></script></body></html>`;
}

/** @param {string} markup */
function enableLiveReload(markup) {
	const client = '<script type="module" src="/@vite/client"></script>';
	return markup.includes('</body>')
		? markup.replace('</body>', `${client}</body>`)
		: `${markup}${client}`;
}

/** @param {string} message */
function renderError(message) {
	return `<!doctype html><html><head><meta charset="utf-8"><title>Preview error</title></head><body><h1>Unable to render email</h1><pre style="white-space:pre-wrap">${escapeHtml(message)}</pre><script type="module" src="/@vite/client"></script></body></html>`;
}

/** @param {unknown} error */
function formatError(error) {
	return error instanceof Error ? error.stack || error.message : String(error);
}

/** @param {string} value */
function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** @param {string} sourceDirectory @param {string} path */
function isPreviewFile(sourceDirectory, path) {
	const sourceRelativePath = relative(sourceDirectory, path);
	if (sourceRelativePath === '' || sourceRelativePath.startsWith(`..${sep}`)) return false;
	return extname(path) === '.tsrx' || sourceRelativePath.split(sep)[0] === 'static';
}
