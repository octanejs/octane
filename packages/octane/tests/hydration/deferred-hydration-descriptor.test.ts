import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Client from 'octane';
import { load, never, type HydrateProps, type HydrateWhen } from 'octane/hydration';
import * as Server from 'octane/server';
import { flushEffects } from '../_helpers.js';

type EditorProps = {
	pending?: Promise<void>;
	onInput?: (value: string) => void;
	onRef?: (element: HTMLInputElement | null) => void;
};

type AppProps = EditorProps & {
	when: HydrateWhen;
	onHydrated?: () => void;
};

type DescriptorRuntime = Pick<typeof Client, 'createElement' | 'Hydrate' | 'use'>;
type Ownership = 'component-owned' | 'directly rooted';

// Public createElement components exercise descriptor adoption without needing
// a compiled template. use() has no compiler-assigned hook slot.
function createDescriptorFixture(runtime: DescriptorRuntime) {
	function Editor(props: EditorProps) {
		if (props.pending) runtime.use(props.pending);
		return runtime.createElement('input', {
			id: 'descriptor-editor',
			defaultValue: 'Server draft',
			ref: props.onRef,
			onInput: (event: Event) => props.onInput?.((event.target as HTMLInputElement).value),
		});
	}

	function boundaryProps(props: AppProps): HydrateProps {
		return {
			when: props.when,
			split: false,
			onHydrated: props.onHydrated,
			children: runtime.createElement(Editor, {
				pending: props.pending,
				onInput: props.onInput,
				onRef: props.onRef,
			}),
		};
	}

	function App(props: AppProps) {
		return runtime.createElement(runtime.Hydrate, boundaryProps(props));
	}

	return { App, boundaryProps };
}

const client = createDescriptorFixture(Client);
const server = createDescriptorFixture(Server as unknown as DescriptorRuntime);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((complete, fail) => {
		resolve = complete;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('deferred hydration of descriptor components', () => {
	let container: HTMLElement;
	let root: Client.Root | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		flushEffects();
	});

	function renderServer(ownership: Ownership, props: AppProps): void {
		container.innerHTML =
			ownership === 'component-owned'
				? Server.renderToString(server.App, props).html
				: Server.renderToString(Server.Hydrate, server.boundaryProps(props)).html;
	}

	function hydrate(ownership: Ownership, props: AppProps, options?: Client.RootOptions): void {
		root =
			ownership === 'component-owned'
				? Client.hydrateRoot(container, client.App, props, options)
				: Client.hydrateRoot(container, Client.Hydrate, client.boundaryProps(props), options);
	}

	function update(ownership: Ownership, props: AppProps): void {
		if (ownership === 'component-owned') root!.render(client.App, props);
		else root!.render(Client.Hydrate, client.boundaryProps(props));
	}

	for (const ownership of ['component-owned', 'directly rooted'] as const) {
		it(`${ownership}: immediately adopts the server input`, async () => {
			const when = load();
			const onInput = vi.fn();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			const onRecoverableError = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			expect(input).not.toBeNull();

			hydrate(ownership, { when, onInput, onRef, onHydrated }, { onRecoverableError });
			await Client.act(() => {});

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onRef).toHaveBeenCalledExactlyOnceWith(input);
			input.value = 'Live draft';
			await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
			expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft');
			expect(onRecoverableError).not.toHaveBeenCalled();
		});

		it(`${ownership}: preserves the server input when suspended activation completes`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onInput = vi.fn();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			const onRecoverableError = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			input.value = 'Typed before hydration';
			input.focus();
			input.setSelectionRange(3, 8);

			hydrate(
				ownership,
				{ when, pending: pending.promise, onInput, onRef, onHydrated },
				{ onRecoverableError },
			);
			await Client.act(() => {});
			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();

			await Client.act(() => pending.resolve());

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(input.value).toBe('Typed before hydration');
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onRef).toHaveBeenCalledExactlyOnceWith(input);
			input.value = 'Live draft';
			await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
			expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft');
			expect(onRecoverableError).not.toHaveBeenCalled();

			root!.unmount();
			root = undefined;
			expect(onRef.mock.calls).toEqual([[input], [null]]);
			expect(container.textContent).toBe('');
		});

		it(`${ownership}: keeps canceled activation inert after its promise settles`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onInput = vi.fn();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			const props = { when, pending: pending.promise, onInput, onRef, onHydrated };
			hydrate(ownership, props);
			await Client.act(() => {});

			await Client.act(() => update(ownership, { ...props, when: never() }));
			await Client.act(() => pending.resolve());
			await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();
			expect(onInput).not.toHaveBeenCalled();
		});

		it(`${ownership}: removes unmatched server content without discarding the resumed input`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onHydrated = vi.fn();
			const onRecoverableError = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			const stale = document.createElement('p');
			stale.textContent = 'Unmatched server content';
			input.parentElement!.append(stale);
			hydrate(ownership, { when, pending: pending.promise, onHydrated }, { onRecoverableError });
			await Client.act(() => {});
			expect(stale.isConnected).toBe(true);

			await Client.act(() => pending.resolve());

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(stale.isConnected).toBe(false);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onRecoverableError).toHaveBeenCalledOnce();
		});

		for (const suspended of [false, true]) {
			it(`${ownership}: cleans up the current server-range tail on ${suspended ? 'resumed' : 'immediate'} adoption`, async () => {
				const pending = deferred<void>();
				const when = load();
				const onInput = vi.fn();
				const onHydrated = vi.fn();
				const onRecoverableError = vi.fn();
				const onUncaughtError = vi.fn();
				renderServer(ownership, { when });
				const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
				input.value = 'Draft before activation';
				const wrapper = input.parentElement!;
				const stale = document.createElement('p');
				stale.textContent = 'Added before activation completed';
				// Another DOM integration can insert content at the boundary's tail
				// while Octane has left its server HTML visible but inactive.
				if (!suspended) wrapper.insertBefore(stale, wrapper.lastChild);
				hydrate(
					ownership,
					{ when, pending: suspended ? pending.promise : undefined, onInput, onHydrated },
					{ onRecoverableError, onUncaughtError },
				);
				await Client.act(() => {});
				if (suspended) {
					wrapper.insertBefore(stale, wrapper.lastChild);
					expect(stale.isConnected).toBe(true);
					expect(onHydrated).not.toHaveBeenCalled();
					await Client.act(() => pending.resolve());
				}

				expect(container.querySelector('#descriptor-editor')).toBe(input);
				expect(input.value).toBe('Draft before activation');
				expect(stale.isConnected).toBe(false);
				expect(onRecoverableError).toHaveBeenCalledOnce();
				expect(onUncaughtError).not.toHaveBeenCalled();
				expect(onHydrated).toHaveBeenCalledOnce();
				input.value = 'Live draft after cleanup';
				await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
				expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft after cleanup');
			});
		}

		it(`${ownership}: does not revive an unmounted pending activation`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			renderServer(ownership, { when });
			hydrate(ownership, { when, pending: pending.promise, onRef, onHydrated });
			await Client.act(() => {});

			root!.unmount();
			root = undefined;
			await Client.act(() => pending.resolve());

			expect(container.childNodes).toHaveLength(0);
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();
		});

		it(`${ownership}: reports a rejected activation without committing its input`, async () => {
			const pending = deferred<void>();
			const when = load();
			const error = new Error('Descriptor data failed');
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			const onUncaughtError = vi.fn();
			renderServer(ownership, { when });
			hydrate(
				ownership,
				{ when, pending: pending.promise, onRef, onHydrated },
				{ onUncaughtError },
			);
			await Client.act(() => {});

			await Client.act(() => pending.reject(error));

			expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(error);
			expect(container.querySelector('#descriptor-editor')).toBeNull();
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();
		});
	}
});
