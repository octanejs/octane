import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState, useTransition } from 'octane';
import { installTestClock, type TestClock } from 'octane/testing';
import { act, mount, nextTask, type MountResult } from './_helpers';
import { BasicSuspense } from './_fixtures/suspense.tsrx';

function Counter(props: { log: string[] }) @{
	const [n, setN] = useState(0);
	const [isPending, start] = useTransition();
	useEffect(() => {
		props.log.push(`effect:${n}`);
	}, [n]);
	<div>
		<span id="n">{String(n)}</span>
		<span id="pending">{isPending ? 'pending' : 'idle'}</span>
		<button id="urgent" onClick={() => setN(n + 1)}>
			{'urgent'}
		</button>
		<button id="transition" onClick={() => start(() => setN(n + 10))}>
			{'transition'}
		</button>
	</div>
}

let clock: TestClock | null = null;
let rendered: MountResult | null = null;

afterEach(() => {
	rendered?.unmount();
	rendered = null;
	clock?.uninstall();
	clock = null;
});

function text(selector: string): string | null | undefined {
	return rendered!.container.querySelector(selector)?.textContent;
}

// A plain click: mount().click() wraps it in flushSync, which also drains transitions.
function press(selector: string): void {
	(rendered!.container.querySelector(selector) as HTMLElement).click();
}

describe('installTestClock', () => {
	it('holds a transition until the clock runs its host task', async () => {
		rendered = mount(Counter, { log: [] });
		clock = installTestClock();

		press('#transition');
		// Real host tasks pass; the transition's task is the clock's.
		await nextTask();
		await nextTask();
		expect(text('#n')).toBe('0');
		expect(text('#pending')).toBe('pending');

		await clock.advance(0);
		expect(text('#n')).toBe('10');
		expect(text('#pending')).toBe('idle');
	});

	it('runs passive effects at the next frame, not before', async () => {
		const log: string[] = [];
		rendered = mount(Counter, { log });
		await act(() => {});
		log.length = 0;
		clock = installTestClock();

		press('#urgent');
		await clock.advance(0);
		expect(text('#n')).toBe('1');
		// Real frames come and go; the effect waits for the clock's frame.
		await new Promise((resolve) => setTimeout(resolve, 50));
		await clock.advance(0);
		expect(log).toEqual([]);

		await clock.frame();
		expect(log).toEqual(['effect:1']);

		// Delivering the effects canceled their fallback timer, so nothing is left
		// to move time to.
		const afterFrame = clock.now();
		await clock.settle();
		expect(log).toEqual(['effect:1']);
		expect(clock.now()).toBe(afterFrame);
	});

	it('throttles a Suspense reveal by virtual time', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		clock = installTestClock();
		rendered = mount(BasicSuspense, { promise });
		expect(text('.fallback')).toBe('loading');

		resolve('ready');
		await clock.advance(99);
		expect(text('.fallback')).toBe('loading');

		await clock.advance(1);
		expect(text('.resolved')).toBe('ready');
	});

	it('lets act() run clock work that is due without moving time', async () => {
		rendered = mount(Counter, { log: [] });
		clock = installTestClock();
		const before = clock.now();

		await act(async () => {
			press('#transition');
		});
		expect(text('#n')).toBe('10');
		expect(clock.now()).toBe(before);
	});

	it('returns held work to the host when uninstalled', async () => {
		rendered = mount(Counter, { log: [] });
		clock = installTestClock();

		press('#transition');
		await nextTask();
		expect(text('#n')).toBe('0');

		clock.uninstall();
		clock = null;
		await vi.waitFor(() => expect(text('#n')).toBe('10'));
	});

	it('refuses a second clock', () => {
		clock = installTestClock();
		expect(() => installTestClock()).toThrow(/already installed/);
	});
});
