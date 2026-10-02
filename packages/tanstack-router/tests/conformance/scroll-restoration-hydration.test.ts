import { afterEach, describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { RouterClient } from '@octanejs/tanstack-router/ssr/client';
import { mount, nextPaint } from '../_helpers';
import {
	makeScrollRestorationRouter,
	ScriptOnceHost,
	type ScrollRestorationRouterOptions,
} from '../_fixtures/scroll-restoration.tsrx';
// @ts-expect-error the shared fixture plugin compiles the router graph for the server
import * as server from '../_fixtures/scroll-restoration.tsrx?octane-ssr';

// Browsers resolve router-core's `browser` export of this subpath, whose helper
// always returns null; this jsdom project does not select that condition. The
// server fixture is bundled for Node separately and keeps the real script.
vi.mock('@tanstack/router-core/scroll-restoration-script', async () => {
	const { createRequire } = await import('node:module');
	const { dirname, join } = await import('node:path');
	const { pathToFileURL } = await import('node:url');
	const require = createRequire(import.meta.url);
	const manifest = require.resolve('@tanstack/router-core/package.json');
	const { exports } = require(manifest);
	const entry = exports['./scroll-restoration-script'].browser.import.default;
	return import(/* @vite-ignore */ pathToFileURL(join(dirname(manifest), entry)).href);
});

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

async function hydrateScrollRestoration(options: ScrollRestorationRouterOptions) {
	const serverRouter = server.makeScrollRestorationRouter({ ...options, isServer: true });
	await serverRouter.load();
	const { html } = renderToString(server.RouterServer, { router: serverRouter });

	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const serverRoot = container.querySelector('.root');
	const serverScripts = container.querySelectorAll('script').length;

	const messages: string[] = [];
	for (const method of ['error', 'warn'] as const) {
		vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
			messages.push(args.map(String).join(' '));
		});
	}
	const errors: unknown[] = [];
	const router = makeScrollRestorationRouter(options);
	await router.load();
	const root = hydrateRoot(
		container,
		RouterClient as any,
		{ router },
		{ onRecoverableError: (error) => errors.push(error) },
	);
	await flush();
	return { container, router, root, serverRoot, serverScripts, messages, errors };
}

// The server build of router-core's `getScrollRestorationScriptForRouter` returns
// the inline restore script and the client build always returns null. React's
// ScriptOnce makes the script remove itself before React hydrates; Octane's
// hydration claims the server's structure, so the client has to render the same
// arm and drop the adopted script once hydration commits.
describe('@octanejs/tanstack-router — scroll restoration script hydration', () => {
	it('adopts and then removes the server scroll restoration script', async () => {
		const result = await hydrateScrollRestoration({ nonce: 'octane-csp' });
		try {
			expect(result.serverScripts).toBe(1);
			expect(result.errors).toEqual([]);
			expect(result.messages).toEqual([]);
			expect(result.container.querySelector('.root')).toBe(result.serverRoot);
			expect(result.container.querySelectorAll('script')).toHaveLength(0);
			expect(result.container.querySelector('.index')?.textContent).toBe('Home');
		} finally {
			result.root.unmount();
			result.container.remove();
		}
	});

	it('hydrates without a script when the scrollRestoration option declines the location', async () => {
		const result = await hydrateScrollRestoration({ scrollRestoration: () => false });
		try {
			expect(result.serverScripts).toBe(0);
			expect(result.errors).toEqual([]);
			expect(result.messages).toEqual([]);
			expect(result.container.querySelector('.root')).toBe(result.serverRoot);
			expect(result.container.querySelectorAll('script')).toHaveLength(0);
		} finally {
			result.root.unmount();
			result.container.remove();
		}
	});

	it('adopts the script when the scrollRestoration option accepts the location', async () => {
		const result = await hydrateScrollRestoration({
			scrollRestoration: ({ location }) => location.pathname === '/',
		});
		try {
			expect(result.serverScripts).toBe(1);
			expect(result.errors).toEqual([]);
			expect(result.messages).toEqual([]);
			expect(result.container.querySelector('.root')).toBe(result.serverRoot);
			expect(result.container.querySelectorAll('script')).toHaveLength(0);
		} finally {
			result.root.unmount();
			result.container.remove();
		}
	});

	it('inserts no script when a client navigation mounts the next route', async () => {
		const result = await hydrateScrollRestoration({});
		const inserted: string[] = [];
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (node.nodeName === 'SCRIPT') inserted.push((node as Element).outerHTML);
				}
			}
		});
		observer.observe(result.container, { childList: true, subtree: true });
		try {
			await result.router.navigate({ to: '/about' });
			await flush();
			expect(result.container.querySelector('.about')?.textContent).toBe('About');
			expect(inserted).toEqual([]);
			expect(result.container.querySelectorAll('script')).toHaveLength(0);
			expect(result.errors).toEqual([]);
			expect(result.messages).toEqual([]);
		} finally {
			observer.disconnect();
			result.root.unmount();
			result.container.remove();
		}
	});
});

// Per react-router's ScriptOnce.tsx, which renders null outside the server.
describe('@octanejs/tanstack-router — ScriptOnce on a client-only mount', () => {
	it('renders no script', () => {
		const router = makeScrollRestorationRouter();
		const r = mount(ScriptOnceHost, { router });
		try {
			expect(r.container.querySelectorAll('script')).toHaveLength(0);
		} finally {
			r.unmount();
		}
	});
});
