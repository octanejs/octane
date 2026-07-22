import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot } from 'octane';
import { interaction } from 'octane/hydration';
import { renderToPipeableStream, renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/stream-ownership-collisions.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/stream-ownership-collisions.tsrx',
);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

function collector() {
	const chunks: string[] = [];
	let end!: () => void;
	const ended = new Promise<void>((resolve) => (end = resolve));
	return {
		chunks,
		ended,
		dest: { write: (chunk: string) => chunks.push(chunk), end },
	};
}

function activate(container: HTMLElement): void {
	for (const script of Array.from(container.querySelectorAll('script'))) {
		if (script.type === 'application/json') continue;
		// eslint-disable-next-line no-eval
		(0, eval)(script.textContent || '');
		script.remove();
	}
}

describe('stream ownership collision resistance', () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
		delete (window as any).$OCTS;
		delete (window as any).$OCTRC;
		delete (window as any).$OCTRX;
	});

	it('treats an authored data-oct-b template as ordinary Hydrate content', async () => {
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const when = interaction({ events: 'click' });
		container.innerHTML = renderToString(server.AuthoredStreamAttribute, { when }).html;
		const root = hydrateRoot(container, client.AuthoredStreamAttribute, {
			when,
			onClick,
			onHydrated,
		});
		try {
			(container.querySelector('#authored-stream-attribute-action') as HTMLButtonElement).click();
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledOnce();
			});
			expect(onClick).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it.each([
		[
			'a forged nested Hydrate attribute',
			client.ForgedNestedHydrateAttribute,
			server.ForgedNestedHydrateAttribute,
			undefined,
		],
		[
			'a malformed static comment',
			client.MalformedStaticComment,
			server.MalformedStaticComment,
			'<!--octane-static-hydrate:not-a-count-->',
		],
		[
			'an unmatched legacy static comment',
			client.MalformedStaticComment,
			server.MalformedStaticComment,
			'<!--octane-static-hydrate:0-->',
		],
	])(
		'waits for the genuine stream past %s',
		async (_label, Component, ServerComponent, authoredHtml) => {
			const serverValue = deferred<string>();
			const onClick = vi.fn();
			const onHydrated = vi.fn();
			const when = interaction({ events: 'click' });
			const c = collector();
			renderToPipeableStream(ServerComponent as any, {
				promise: serverValue.promise,
				when,
				authoredHtml,
			}).pipe(c.dest);
			container.innerHTML = c.chunks.join('');
			activate(container);
			const shellChunkCount = c.chunks.length;
			const fallback = container.querySelector('#stream-collision-action') as HTMLButtonElement;
			const root = hydrateRoot(container, Component as any, {
				promise: new Promise<string>(() => {}),
				when,
				authoredHtml,
				onClick,
				onHydrated,
			});
			try {
				fallback.click();
				await act(() => {});
				expect(onHydrated).not.toHaveBeenCalled();
				expect(onClick).not.toHaveBeenCalled();

				serverValue.resolve('Authenticated reveal');
				await c.ended;
				container.insertAdjacentHTML('beforeend', c.chunks.slice(shellChunkCount).join(''));
				activate(container);
				const revealed = container.querySelector('#stream-collision-action') as HTMLButtonElement;
				expect(revealed.textContent).toBe('Authenticated reveal');
				await vi.waitFor(async () => {
					await act(() => {});
					expect(onHydrated).toHaveBeenCalledOnce();
				});
				expect(container.querySelector('#stream-collision-action')).toBe(revealed);
				expect(onClick).toHaveBeenCalledOnce();
				expect(onClick).toHaveBeenCalledWith('Authenticated reveal');
			} finally {
				root.unmount();
			}
		},
	);
});
