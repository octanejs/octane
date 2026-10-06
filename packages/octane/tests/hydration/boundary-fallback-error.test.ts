import { afterEach, describe, expect, it } from 'vitest';
import * as Client from 'octane';
import { interaction } from 'octane/hydration';
import * as Server from 'octane/server';

type Runtime = Pick<typeof Client, 'createElement' | 'Hydrate' | 'Suspense'>;
type Step = 'suspend' | 'mismatch' | 'throw' | 'ok';

// One error object, thrown again by a later, unrelated hydration.
const failure = new Error('render failed');

/**
 * Each client render of the boundary's content takes the next step: suspend,
 * render a different tag than the server's (a mismatch), throw `failure`, or
 * render what the server did.
 */
function createFixture(runtime: Runtime, steps: Step[]) {
	let gate: Promise<void> | null = null;
	let open!: () => void;
	function Content() {
		const step = steps.shift() ?? 'ok';
		if (step === 'suspend') {
			gate ??= new Promise<void>((resolve) => (open = resolve));
			throw gate;
		}
		if (step === 'throw') throw failure;
		return runtime.createElement(step === 'mismatch' ? 'i' : 'b', null, 'content');
	}
	const content = () => runtime.createElement(Content);
	return {
		Island: () =>
			runtime.createElement(runtime.Hydrate, {
				when: interaction({ events: 'click' }),
				split: false,
				children: content(),
			}),
		Arm: () =>
			runtime.createElement(runtime.Suspense, { fallback: 'pending', children: content() }),
		Plain: () => runtime.createElement('main', null, content()),
		resume: () => open(),
	};
}

describe('a boundary fallback whose client render throws', () => {
	const containers: HTMLElement[] = [];
	const roots: Client.Root[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) root.unmount();
		for (const container of containers.splice(0)) container.remove();
	});

	function serve(component: () => unknown): HTMLElement {
		const container = document.createElement('div');
		container.innerHTML = Server.renderToString(
			component as Parameters<typeof Server.renderToString>[0],
		).html;
		document.body.append(container);
		containers.push(container);
		return container;
	}

	// The island activates on a click, and the Suspense arm resumes, after the
	// root's hydration committed, so each one's fallback runs outside any
	// hydration. The error it throws is that root's alone: a later root that
	// throws the same error while it adopts server DOM still renders on the
	// client and reports it as the cause. react-dom 19.2.7 probe (a Suspense arm
	// for the first root): the first root reports only the uncaught error, the
	// second only a recoverable #423 whose cause is that error.
	it.each<['Island' | 'Arm', Step[]]>([
		['Island', ['mismatch', 'throw']],
		['Arm', ['suspend', 'mismatch', 'throw']],
	])('leaves a later hydration unaffected (%s)', async (owner, steps) => {
		const first = createFixture(Client, steps);
		const container = serve(createFixture(Server as unknown as Runtime, [])[owner]);
		const uncaught: unknown[] = [];
		const firstRecoverable: unknown[] = [];
		roots.push(
			Client.hydrateRoot(container, first[owner], undefined, {
				onUncaughtError: (error) => uncaught.push(error),
				onRecoverableError: (error) => firstRecoverable.push(error),
			}),
		);
		await Client.act(() => {});
		expect(container.textContent).toBe('content');
		expect(uncaught).toEqual([]);
		await Client.act(() =>
			owner === 'Arm' ? first.resume() : container.querySelector('b')!.click(),
		);
		expect(uncaught).toEqual([failure]);
		expect(firstRecoverable).toEqual([]);

		const later = createFixture(Client, ['throw']);
		const next = serve(createFixture(Server as unknown as Runtime, []).Plain);
		const recoverable: unknown[] = [];
		const laterUncaught: unknown[] = [];
		roots.push(
			Client.hydrateRoot(next, later.Plain, undefined, {
				onUncaughtError: (error) => laterUncaught.push(error),
				onRecoverableError: (error) => recoverable.push(error),
			}),
		);
		await Client.act(() => {});
		expect(laterUncaught).toEqual([]);
		expect(recoverable).toHaveLength(1);
		expect((recoverable[0] as Error).cause).toBe(failure);
		expect(next.innerHTML.replace(/<!--[^]*?-->/g, '')).toBe('<main><b>content</b></main>');
	});
});
