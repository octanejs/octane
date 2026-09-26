import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { StartClient } from '@octanejs/tanstack-start/client';
import { expect, it } from 'vitest';
import { makeDocumentRouter } from './_fixtures/document-hydration.tsx';
// @ts-expect-error the shared fixture plugin compiles the router graph for the server
import * as server from './_fixtures/document-hydration.tsx?octane-ssr';

it('hydrates the server route in the document shell and activates its original button', async () => {
	const serverRouter = server.makeDocumentRouter(true);
	await serverRouter.load();
	expect(serverRouter.state.matches.map((match: { status: string }) => match.status)).toEqual([
		'success',
		'success',
	]);
	const { html } = renderToString(server.StartServer, { router: serverRouter });
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const container = doc.querySelector('#__app')!;
	expect(container.querySelectorAll('#counter')).toHaveLength(1);
	const button = container.querySelector<HTMLButtonElement>('#counter')!;
	expect(button.textContent?.trim()).toBe('Count: 0');
	document.body.append(container);

	const clientRouter = makeDocumentRouter(false);
	await clientRouter.load();
	expect(clientRouter.state.matches.map((match) => match.status)).toEqual(['success', 'success']);
	const errors: unknown[] = [];
	const root = hydrateRoot(
		container,
		StartClient,
		{ router: clientRouter },
		{
			onRecoverableError: (error) => errors.push(error),
		},
	);
	try {
		flushSync(() => {});
		expect.soft(container.querySelectorAll('main')).toHaveLength(1);
		expect.soft(container.querySelector('#counter')).toBe(button);
		flushSync(() => button.click());
		expect.soft(button.textContent?.trim()).toBe('Count: 1');
		expect(errors).toEqual([]);
	} finally {
		root.unmount();
		container.remove();
	}
});
