import { basename, join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import { QueryClient as ReactQueryClient } from '@tanstack/react-query';
import { setupRouterSsrQueryIntegration as setupReact } from '@tanstack/react-router-ssr-query';
import { describe, expect, it } from 'vitest';
import { renderToString as renderOctaneToString } from 'octane/server';
import { QueryClient as OctaneQueryClient } from '@octanejs/tanstack-query';
import { setupRouterSsrQueryIntegration as setupOctane } from '@octanejs/tanstack-router-ssr-query';
import * as octaneFixture from '../_fixtures/ssr-query-diff.tsrx';

const fixturePath = resolve(__dirname, '../_fixtures/ssr-query-diff.tsrx');

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

async function loadReactFixture(): Promise<typeof octaneFixture> {
	const slug = basename(fixturePath).replace(/\.tsrx$/, '');
	const file = join(__dirname, '.react-cache', `${slug}-${hashString(fixturePath)}.js`);
	return import(/* @vite-ignore */ file);
}

function makeRouter(Wrap?: unknown): any {
	return { options: { Wrap }, isServer: true, serverSsrLifecycle: {} };
}

function normalize(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/>\s+</g, '><')
		.trim();
}

describe('differential: @octanejs/tanstack-router-ssr-query vs @tanstack/react-router-ssr-query', () => {
	// @parity-case differential:tanstack-router-ssr-query-provider-ssr
	it('matches provider-backed SSR and preserves the existing wrapper', async () => {
		const reactFixture = await loadReactFixture();
		const octaneClient = new OctaneQueryClient();
		const reactClient = new ReactQueryClient();
		octaneClient.setQueryData(['parity-proof'], 'server-cached');
		reactClient.setQueryData(['parity-proof'], 'server-cached');
		const octaneRouter = makeRouter(octaneFixture.ExistingWrapper);
		const reactRouter = makeRouter(reactFixture.ExistingWrapper);

		setupOctane({ router: octaneRouter, queryClient: octaneClient } as any);
		setupReact({ router: reactRouter, queryClient: reactClient } as any);

		const octaneHtml = renderOctaneToString(octaneFixture.WrappedQueryReader as any, {
			Wrap: octaneRouter.options.Wrap,
		}).html;
		const reactHtml = renderReactToString(
			createElement(reactFixture.WrappedQueryReader as any, { Wrap: reactRouter.options.Wrap }),
		);
		expect(normalize(octaneHtml)).toBe(normalize(reactHtml));
		expect(normalize(octaneHtml)).toContain('data-existing-wrapper="preserved"');
		expect(normalize(octaneHtml)).toContain('server-cached');
		expect(typeof octaneRouter.options.dehydrate).toBe(typeof reactRouter.options.dehydrate);
		expect(octaneRouter.serverSsrLifecycle.onServerSsrAttach).toHaveLength(1);
		expect(reactRouter.serverSsrLifecycle.onServerSsrAttach).toHaveLength(1);
		octaneClient.clear();
		reactClient.clear();
	});

	// @parity-case differential:tanstack-router-ssr-query-wrap-control
	it('matches the disabled query-client wrapper control', async () => {
		const reactFixture = await loadReactFixture();
		const octaneExisting = octaneFixture.ExistingWrapper;
		const reactExisting = reactFixture.ExistingWrapper;
		const octaneRouter = makeRouter(octaneExisting);
		const reactRouter = makeRouter(reactExisting);
		const octaneClient = new OctaneQueryClient();
		const reactClient = new ReactQueryClient();
		setupOctane({ router: octaneRouter, queryClient: octaneClient, wrapQueryClient: false } as any);
		setupReact({ router: reactRouter, queryClient: reactClient, wrapQueryClient: false } as any);
		expect(octaneRouter.options.Wrap).toBe(octaneExisting);
		expect(reactRouter.options.Wrap).toBe(reactExisting);
		expect(typeof octaneRouter.options.dehydrate).toBe(typeof reactRouter.options.dehydrate);
		octaneClient.clear();
		reactClient.clear();
	});
});
