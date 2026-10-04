import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Sibling slots at the root of a fragment body share no static content to
// position against. Each must still insert at its own source position: an
// earlier slot that is empty must mount its content before a later sibling's,
// and a slot that was emptied must refill there after that sibling is gone.

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');
const FILE = 'fragment-sibling-slots.tsrx';
const SOURCE = readFileSync(join(FIXTURES, FILE), 'utf8');
const REPLAY_FILE = 'fragment-sibling-slots-replay.tsrx';
const REPLAY_SOURCE = readFileSync(join(FIXTURES, REPLAY_FILE), 'utf8');
const SHAPES = [
	'ComponentRoot',
	'ArmFragment',
	'TryBody',
	'ForRow',
	'SwitchThenIf',
	'ComponentSiblings',
	'ListThenIf',
] as const;

// The octane project covers the development compile; octane-prod covers production.
const compiles =
	process.env.OCTANE_TEST_COMPILE_MODE === 'prod'
		? [
				{ dev: false, strong: false },
				{ dev: false, strong: true },
			]
		: [
				{ dev: true, strong: false },
				{ dev: true, strong: true },
			];

type Props = { a: boolean; b: boolean };
const view = ({ a, b }: Props) => (a ? 'a' : '') + (b ? 'b' : '');
// An empty `a` fills in while `b` renders.
const FILL_BEFORE: Props[] = [
	{ a: false, b: true },
	{ a: true, b: true },
	{ a: false, b: true },
	{ a: false, b: false },
	{ a: true, b: false },
	{ a: true, b: true },
];
// `a` empties while `b` renders, then refills after `b` has unmounted.
const REFILL_AFTER: Props[] = [
	{ a: true, b: true },
	{ a: false, b: true },
	{ a: false, b: false },
	{ a: true, b: false },
	{ a: true, b: true },
];

describe.each(compiles)('fragment sibling slots (dev: $dev, strong: $strong)', (options) => {
	const compileOptions = { ...options, hmr: false };
	const client = loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'client', compileOptions });
	const server = loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'server', compileOptions });

	let container: HTMLElement;
	let unmount: (() => void) | null;
	let errors: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		unmount = null;
		errors = vi.spyOn(console, 'error');
	});

	afterEach(() => {
		unmount?.();
		container.remove();
		errors.mockRestore();
	});

	/** Re-render through each state, checking the slots' order after every commit. */
	function step(render: (props: Props) => void, states: Props[]) {
		for (const props of states.slice(1)) {
			flushSync(() => render(props));
			expect(container.querySelector('main')!.textContent).toBe(view(props));
		}
	}

	describe.each(SHAPES)('%s', (shape) => {
		it.each([
			['fills an empty earlier slot before its later sibling', FILL_BEFORE],
			['refills an emptied earlier slot after its later sibling unmounts', REFILL_AFTER],
		])('%s', (_, states) => {
			const root = createRoot(container);
			unmount = () => root.unmount();
			flushSync(() => root.render(client[shape], states[0]));
			expect(container.querySelector('main')!.textContent).toBe(view(states[0]));
			step((props) => root.render(client[shape], props), states);
			expect(errors).not.toHaveBeenCalled();
		});

		it.each([
			['fills an empty earlier slot before its later sibling', FILL_BEFORE],
			['refills an emptied earlier slot after its later sibling unmounts', REFILL_AFTER],
		])('hydrates, then %s', async (_, states) => {
			container.innerHTML = renderToString(server[shape], states[0]).html;
			const serverSpans = [...container.querySelectorAll('span')];
			const recoverable: unknown[] = [];
			const root = hydrateRoot(container, client[shape], states[0], {
				onRecoverableError: (error: unknown) => recoverable.push(error),
			});
			unmount = () => root.unmount();
			flushSync(() => {});
			await act(async () => {});
			expect(recoverable).toEqual([]);
			expect([...container.querySelectorAll('span')]).toEqual(serverSpans);
			step((props) => root.render(client[shape], props), states);
			expect(errors).not.toHaveBeenCalled();
		});
	});
});

// A render that updates its own state replays before its slots settle. Each
// slot still gets its source position, whichever pass creates it, and a
// hydrating slot adopts its own server range rather than an earlier sibling's.
const REPLAY_SHAPES = [
	'ReplayedIfs',
	'ReplayedIfThenSwitch',
	'ReplayedComponent',
	'ReplayedLiteBeforeIf',
	'ReplayedComponentBeforeIf',
] as const;
// `a` empties while `b` stays empty, then fills before `b`.
const EMPTY_THEN_FILL: Props[] = [
	{ a: true, b: false },
	{ a: false, b: false },
	{ a: false, b: true },
	{ a: true, b: true },
];

describe.each(compiles.filter((options) => !options.strong))(
	'fragment sibling slots in a replayed render (dev: $dev)',
	(options) => {
		const compileOptions = { ...options, hmr: false };
		const client = loadCompiledFixtureSource(REPLAY_SOURCE, {
			id: REPLAY_FILE,
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(REPLAY_SOURCE, {
			id: REPLAY_FILE,
			mode: 'server',
			compileOptions,
		});

		let container: HTMLElement;
		let unmount: (() => void) | null;
		let errors: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			container = document.createElement('div');
			document.body.appendChild(container);
			unmount = null;
			errors = vi.spyOn(console, 'error');
		});

		afterEach(() => {
			unmount?.();
			container.remove();
			errors.mockRestore();
		});

		describe.each(REPLAY_SHAPES)('%s', (shape) => {
			it('mounts', () => {
				const root = createRoot(container);
				unmount = () => root.unmount();
				for (const states of [FILL_BEFORE, REFILL_AFTER]) {
					for (const props of states) {
						flushSync(() => root.render(client[shape], props));
						expect(container.querySelector('main')!.textContent).toBe(view(props));
					}
					flushSync(() => root.render(client[shape], { a: false, b: false }));
				}
				expect(errors).not.toHaveBeenCalled();
			});

			// A fresh root, so the hydrating render is the one that replays.
			it.each([
				['refills an emptied earlier slot after its later sibling unmounts', REFILL_AFTER],
				['fills an empty earlier slot before its later sibling', FILL_BEFORE],
				['empties an earlier slot, then fills it before its later sibling', EMPTY_THEN_FILL],
			])('hydrates, then %s', async (_, states) => {
				container.innerHTML = renderToString(server[shape], states[0]).html;
				const serverSpans = [...container.querySelectorAll('span')];
				const recoverable: unknown[] = [];
				const root = hydrateRoot(container, client[shape], states[0], {
					onRecoverableError: (error: unknown) => recoverable.push(error),
				});
				unmount = () => root.unmount();
				flushSync(() => {});
				await act(async () => {});
				expect(recoverable).toEqual([]);
				const spans = [...container.querySelectorAll('span')];
				expect(spans).toHaveLength(serverSpans.length);
				spans.forEach((span, i) => expect(span).toBe(serverSpans[i]));
				expect(container.querySelector('main')!.textContent).toBe(view(states[0]));
				for (const props of states.slice(1)) {
					flushSync(() => root.render(client[shape], props));
					expect(container.querySelector('main')!.textContent).toBe(view(props));
				}
				expect(errors).not.toHaveBeenCalled();
			});
		});
	},
);
