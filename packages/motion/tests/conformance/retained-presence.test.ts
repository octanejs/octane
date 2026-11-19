import { describe, expect, it, vi, beforeEach } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn() }));
vi.mock('motion', async (original) => ({
	...(await original<typeof import('motion')>()),
	animate: animateMock,
}));
import { resolve } from 'node:path';
import { motionValue } from 'motion';
import { act, flushSync, hydrateRoot } from 'octane';
import { octane } from 'octane/compiler/vite';
import { createServer } from 'vite';
import { mount, nextPaint } from '../_helpers';
import {
	RetainedToggle,
	RetainedRemovable,
	RetainedControllerToggle,
	RetainedNamedToggle,
	RetainedAuthoredValueToggle,
} from '../_fixtures/retained-presence.tsrx';

beforeEach(() => {
	animateMock.mockReset();
});

describe('retained presence', () => {
	it('suppresses a stale transitionEnd completion after authored value replacement', async () => {
		const finishes: Array<() => void> = [];
		const stops: Array<ReturnType<typeof vi.fn>> = [];
		animateMock.mockImplementation(() => {
			const stop = vi.fn();
			stops.push(stop);
			return { stop, then: (done: () => void) => finishes.push(done) };
		});
		const record = vi.fn(),
			original = motionValue(1),
			fresh = motionValue(0.7);
		const props = { original, fresh, mode: 'fresh' as const, record, end: true };
		const r = mount(RetainedAuthoredValueToggle, { ...props, show: true });
		try {
			r.update(RetainedAuthoredValueToggle, { ...props, show: false });
			expect(finishes).toHaveLength(1);
			finishes[0]();
			expect(finishes).toHaveLength(2);
			r.click('#switch-authored-value');
			expect(stops[0]).toHaveBeenCalledOnce();
			expect(stops[1]).toHaveBeenCalledOnce();
			finishes[1]();
			await Promise.resolve();
			await nextPaint();
			expect(record.mock.calls).toEqual([['owner']]);
			expect(r.container.querySelector('#authored-exit')).toBeNull();
		} finally {
			r.unmount();
		}
	});

	it('does not complete a changed equal-target label while its host is exiting', async () => {
		const exits: Array<() => void> = [];
		animateMock.mockImplementation(() => ({
			stop: vi.fn(),
			then: (done: () => void) => exits.push(done),
		}));
		const record = vi.fn();
		const r = mount(RetainedNamedToggle, { show: true, record });
		try {
			r.update(RetainedNamedToggle, { show: false, record });
			r.click('#change-label');
			await nextPaint();
			expect(record).not.toHaveBeenCalled();
			expect(exits).toHaveLength(1);
			exits[0]();
			await nextPaint();
			expect(record.mock.calls.map(([event]) => event).sort()).toEqual(['complete', 'exit']);
		} finally {
			r.unmount();
		}
	});

	it('completes a reentering changed label only when its physical animation finishes', () => {
		const finishes: Array<() => void> = [];
		animateMock.mockImplementation(() => ({
			stop: vi.fn(),
			then: (done: () => void) => finishes.push(done),
		}));
		const record = vi.fn();
		const r = mount(RetainedNamedToggle, { show: true, record, label: 'first' });
		try {
			r.update(RetainedNamedToggle, { show: false, record, label: 'first' });
			r.update(RetainedNamedToggle, { show: true, record, label: 'second' });
			expect(record).not.toHaveBeenCalled();
			expect(finishes).toHaveLength(2);
			finishes[0]();
			expect(record).not.toHaveBeenCalled();
			finishes[1]();
			expect(record.mock.calls).toEqual([['second']]);
		} finally {
			r.unmount();
		}
	});

	it('restarts an exit after controller replacement or a controller-to-declarative switch', async () => {
		const finishes: Array<() => void> = [],
			stops: Array<ReturnType<typeof vi.fn>> = [];
		animateMock.mockImplementation(() => {
			const stop = vi.fn();
			stops.push(stop);
			return {
				then(done: () => void) {
					finishes.push(done);
				},
				stop,
			};
		});
		const trace: string[] = [],
			record = (event: string) => trace.push(event);
		const r = mount(RetainedControllerToggle, { show: true, record });
		try {
			r.update(RetainedControllerToggle, { show: false, record });
			r.click('#switch-controller');
			r.click('#switch-controller');
			expect(finishes).toHaveLength(3);
			expect(stops[0]).toHaveBeenCalledOnce();
			expect(stops[1]).toHaveBeenCalledOnce();
			finishes[0]();
			finishes[1]();
			expect(trace).toEqual([]);
			finishes[2]();
			await nextPaint();
			expect(r.container.querySelector('#controller-exit')).toBeNull();
			expect(trace).toEqual(['host-complete', 'complete']);
		} finally {
			r.unmount();
		}
	});
	it('retains the original keyed child through exit and reentry, then cleans it once', async () => {
		const finishes: Array<() => void> = [];
		const stops: Array<ReturnType<typeof vi.fn>> = [];
		animateMock.mockImplementation(() => {
			const stop = vi.fn();
			stops.push(stop);
			return {
				then(done: () => void) {
					finishes.push(done);
				},
				stop,
			};
		});
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const ref = { current: null as HTMLButtonElement | null };
		const r = mount(RetainedToggle, { show: true, record, hostRef: ref });
		try {
			const original = r.find('#row');
			original.click();
			await nextPaint();
			expect(original.textContent).toBe('Row:1');
			r.update(RetainedToggle, { show: false, record, hostRef: ref });
			await nextPaint();
			expect(r.find('#row')).toBe(original);
			expect(original.hasAttribute('inert')).toBe(true);
			expect(original.getAttribute('aria-hidden')).toBe('true');
			expect(ref.current).toBe(original);
			expect(trace).toEqual(['mount']);
			expect(animateMock.mock.calls.at(-1)?.[0]).toBe(original);

			r.update(RetainedToggle, { show: true, record, hostRef: ref, label: 'Again' });
			await nextPaint();
			expect(r.find('#row')).toBe(original);
			expect(original.textContent).toBe('Again:1');
			expect(original.hasAttribute('inert')).toBe(false);
			expect(stops[0]).toHaveBeenCalledOnce();
			finishes[0]();
			expect(trace).toEqual(['mount']);

			r.update(RetainedToggle, { show: false, record, hostRef: ref });
			await nextPaint();
			finishes[2]();
			await nextPaint();
			expect(r.container.querySelector('#row')).toBeNull();
			expect(ref.current).toBeNull();
			expect(trace).toEqual(
				expect.arrayContaining(['mount', 'host-complete', 'cleanup', 'complete']),
			);
			expect(trace).toHaveLength(4);
			expect(trace.indexOf('host-complete')).toBeLessThan(trace.indexOf('complete'));
			r.update(RetainedToggle, { show: true, record, hostRef: ref });
			await nextPaint();
			expect(r.find('#row')).not.toBe(original);
			expect(trace.at(-1)).toBe('mount');
		} finally {
			r.unmount();
		}
	});
	it('animates the original host back to its present target on same-key reentry', () => {
		const finishes: Array<() => void> = [];
		animateMock.mockImplementation((node: HTMLElement, target: Record<string, string | number>) => {
			if (target.opacity === 0) node.style.opacity = '0.4';
			else if (target.opacity !== undefined) node.style.opacity = String(target.opacity);
			return {
				stop: vi.fn(),
				then(done: () => void) {
					finishes.push(done);
				},
			};
		});
		const record = vi.fn();
		const r = mount(RetainedToggle, { show: true, record });
		try {
			const original = r.find('#row');
			r.update(RetainedToggle, { show: false, record });
			expect(original.style.opacity).toBe('0.4');
			r.update(RetainedToggle, { show: true, record });
			expect(r.find('#row')).toBe(original);
			expect(original.style.opacity).toBe('1');
			expect(animateMock.mock.calls.map((call) => call[1])).toEqual([
				{ opacity: 0 },
				{ opacity: 1 },
			]);
			finishes[0]();
			expect(record).not.toHaveBeenCalledWith('complete');
		} finally {
			r.unmount();
		}
	});

	it('coalesces a changed animate target with the same reentry', () => {
		animateMock.mockReturnValue({ stop: vi.fn(), then() {} });
		const record = vi.fn();
		const r = mount(RetainedToggle, { show: true, record });
		try {
			r.update(RetainedToggle, { show: false, record });
			r.update(RetainedToggle, { show: true, record, animate: 0.8 });
			expect(animateMock.mock.calls.map((call) => call[1])).toEqual([
				{ opacity: 0 },
				{ opacity: 0.8 },
			]);
		} finally {
			r.unmount();
		}
	});

	it('replaces a present key directly without animating an old clone', async () => {
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedToggle, { show: true, record, rowKey: 'a' });
		try {
			const original = r.find('#row');
			r.update(RetainedToggle, { show: true, record, rowKey: 'b', label: 'New' });
			await nextPaint();
			expect(r.container.querySelectorAll('#row')).toHaveLength(1);
			expect(r.find('#row')).not.toBe(original);
			expect(animateMock).not.toHaveBeenCalled();
			expect(trace.filter((event) => event === 'cleanup')).toHaveLength(1);
		} finally {
			r.unmount();
		}
	});

	it('replaces a different key immediately and ignores the old exit completion', async () => {
		let finish!: () => void;
		const stop = vi.fn();
		animateMock.mockReturnValue({
			then(done: () => void) {
				finish = done;
			},
			stop,
		});
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedToggle, { show: true, record, rowKey: 'a' });
		try {
			const original = r.find('#row');
			r.update(RetainedToggle, { show: false, record, rowKey: 'a' });
			r.update(RetainedToggle, { show: true, record, rowKey: 'b', label: 'New' });
			await nextPaint();
			expect(r.find('#row')).not.toBe(original);
			expect(r.find('#row').textContent).toBe('New:0');
			expect(stop).toHaveBeenCalledOnce();
			finish();
			expect(trace.filter((event) => event === 'cleanup')).toHaveLength(1);
			expect(trace).not.toContain('complete');
		} finally {
			r.unmount();
		}
	});

	it('keeps the ordinary clone exit for an independently removed host while the owner is present', async () => {
		let finish!: () => void;
		animateMock.mockReturnValue({
			then(done: () => void) {
				finish = done;
			},
			stop: vi.fn(),
		});
		const record = vi.fn();
		const r = mount(RetainedRemovable, { show: true, record });
		try {
			const original = r.find('#exit-host');
			r.find('#remove-host').click();
			await nextPaint();
			const clone = r.find('#exit-host');
			expect(clone).not.toBe(original);
			expect(animateMock.mock.calls.at(-1)?.[0]).toBe(clone);
			expect(record).not.toHaveBeenCalled();
			finish();
			expect(r.container.querySelector('#exit-host')).toBeNull();
		} finally {
			r.unmount();
		}
	});

	it('returns a host first mounted during exit to its present target on reentry', async () => {
		animateMock.mockImplementation((node: HTMLElement, target: { opacity: number }) => {
			node.style.opacity = target.opacity === 0 ? '0.4' : String(target.opacity);
			return { stop: vi.fn(), then() {} };
		});
		const record = vi.fn();
		const r = mount(RetainedRemovable, { show: true, record });
		try {
			r.update(RetainedRemovable, { show: false, record });
			r.find('#replace-host').click();
			await nextPaint();
			const replacement = r.find('#exit-host') as HTMLElement;
			expect(replacement.style.opacity).toBe('0.4');
			r.update(RetainedRemovable, { show: true, record });
			expect(r.find('#exit-host')).toBe(replacement);
			expect(replacement.style.opacity).toBe('1');
			expect(record).not.toHaveBeenCalledWith('complete');
		} finally {
			r.unmount();
		}
	});

	it('keeps a replacement host exiting when it mounts with an initial target', async () => {
		const exits: Array<() => void> = [];
		animateMock.mockImplementation((node: HTMLElement, target: { opacity: number }) => {
			node.style.opacity = target.opacity === 0 ? '0.4' : String(target.opacity);
			return {
				stop: vi.fn(),
				then(done: () => void) {
					if (target.opacity === 0) exits.push(done);
				},
			};
		});
		const trace: string[] = [],
			record = (event: string) => trace.push(event),
			initial = { opacity: 0.8 };
		const r = mount(RetainedRemovable, { show: true, record, initial });
		try {
			r.update(RetainedRemovable, { show: false, record, initial });
			r.find('#replace-host').click();
			await nextPaint();
			expect((r.find('#exit-host') as HTMLElement).style.opacity).toBe('0.4');
			expect(trace).toEqual([]);
			exits.at(-1)!();
			await nextPaint();
			expect(r.container.querySelector('#removable')).toBeNull();
			expect(trace.sort()).toEqual(['cleanup', 'complete']);
		} finally {
			r.unmount();
		}
	});

	it('settles when the last exit host disappears but allows replacement in the same commit', async () => {
		const finishes: Array<() => void> = [];
		animateMock.mockImplementation(() => ({
			then(done: () => void) {
				finishes.push(done);
			},
			stop: vi.fn(),
		}));
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedRemovable, { show: true, record });
		try {
			r.update(RetainedRemovable, { show: false, record });
			r.find('#replace-host').click();
			await nextPaint();
			expect(r.container.querySelector('#removable')).not.toBeNull();
			expect(trace).toEqual([]);
			r.find('#remove-host').click();
			await nextPaint();
			await nextPaint();
			expect(r.container.querySelector('#removable')).toBeNull();
			expect(trace.sort()).toEqual(['cleanup', 'complete']);
			for (const finish of finishes) finish();
			expect(trace).toHaveLength(2);
		} finally {
			r.unmount();
		}
	});

	it('retires immediately when the retained child has no eligible exit target', async () => {
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedToggle, { show: true, record, exit: false });
		try {
			r.update(RetainedToggle, { show: false, record, exit: false });
			await nextPaint();
			expect(r.container.querySelector('#row')).toBeNull();
			expect(trace).toEqual(expect.arrayContaining(['mount', 'cleanup', 'complete']));
			expect(trace).toHaveLength(3);
			expect(animateMock).not.toHaveBeenCalled();
		} finally {
			r.unmount();
		}
	});

	it('rechecks the committed key after a host completion callback synchronously reenters', async () => {
		let finish!: () => void;
		animateMock.mockReturnValue({
			then(done: () => void) {
				finish = done;
			},
			stop: vi.fn(),
		});
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		let r!: ReturnType<typeof mount>;
		const hostComplete = () =>
			flushSync(() => r.update(RetainedToggle, { show: true, record, hostComplete }));
		r = mount(RetainedToggle, { show: true, record, hostComplete });
		try {
			const original = r.find('#row');
			r.update(RetainedToggle, { show: false, record, hostComplete });
			finish();
			await nextPaint();
			expect(r.find('#row')).toBe(original);
			expect(trace).toEqual(['mount', 'host-complete']);
		} finally {
			r.unmount();
		}
	});

	it('retires an exiting child when Activity disconnects its effects', async () => {
		let finish!: () => void;
		const stop = vi.fn();
		animateMock.mockReturnValue({
			then(done: () => void) {
				finish = done;
			},
			stop,
		});
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedToggle, { show: true, record });
		try {
			r.update(RetainedToggle, { show: false, record });
			r.update(RetainedToggle, { show: false, record, activity: 'hidden' });
			await nextPaint();
			expect(r.container.querySelector('#row')).toBeNull();
			expect(stop).toHaveBeenCalledOnce();
			finish();
			expect(trace.filter((event) => event === 'complete')).toHaveLength(1);
		} finally {
			r.unmount();
		}
	});
	it('retires immediately when animation features are disabled', async () => {
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedToggle, { show: true, record, disabled: true });
		try {
			r.update(RetainedToggle, { show: false, record, disabled: true });
			await nextPaint();
			expect(r.container.querySelector('#row')).toBeNull();
			expect(trace.filter((event) => event === 'complete')).toHaveLength(1);
			expect(animateMock).not.toHaveBeenCalled();
		} finally {
			r.unmount();
		}
	});

	it('does not apply a canceled exit transitionEnd or complete after disposal', async () => {
		const finishes: Array<() => void> = [];
		animateMock.mockImplementation(() => ({
			then(done: () => void) {
				finishes.push(done);
			},
			stop: vi.fn(),
		}));
		const trace: string[] = [];
		const record = (event: string) => trace.push(event);
		const r = mount(RetainedToggle, { show: true, record, end: true });
		r.update(RetainedToggle, { show: false, record, end: true });
		expect(animateMock.mock.calls[0][1]).toEqual({ opacity: 0 });
		r.update(RetainedToggle, { show: true, record, end: true });
		finishes[0]();
		expect(animateMock).toHaveBeenCalledTimes(2);
		r.update(RetainedToggle, { show: false, record, end: true });
		r.unmount();
		finishes[2]();
		expect(trace).not.toContain('complete');
		expect(animateMock).toHaveBeenCalledTimes(3);
	});

	it.each(['absent', 'authored'] as const)(
		'restores an %s end-only field if reentry interrupts transitionEnd completion',
		(mode) => {
			const finishes: Array<() => void> = [];
			animateMock.mockImplementation(
				(node: HTMLElement, target: Record<string, string | number>) => {
					if (target.display !== undefined) node.style.display = String(target.display);
					return {
						stop: vi.fn(),
						then(done: () => void) {
							finishes.push(done);
						},
					};
				},
			);
			const record = vi.fn();
			const display = mode === 'authored' ? 'block' : undefined;
			const r = mount(RetainedToggle, { show: true, record, end: true, display });
			try {
				const original = r.find('#row');
				if (display) original.style.setProperty('display', display, 'important');
				r.update(RetainedToggle, { show: false, record, end: true, display });
				finishes[0]();
				expect(original.style.display).toBe('none');
				r.update(RetainedToggle, { show: true, record, end: true });
				expect(original.style.display).toBe(display ?? '');
				expect(original.style.getPropertyPriority('display')).toBe(display ? 'important' : '');
				finishes[1]();
				expect(r.find('#row')).toBe(original);
				expect(record).not.toHaveBeenCalledWith('complete');
			} finally {
				r.unmount();
			}
		},
	);

	it('renders the present child on the server and hydrates the same host', async () => {
		const server = await createServer({
			root: resolve(import.meta.dirname, '../..'),
			configFile: false,
			plugins: [octane()],
			server: { middlewareMode: true, watch: null, ws: false },
			optimizeDeps: { noDiscovery: true },
			ssr: { noExternal: ['@octanejs/motion'] },
		});
		const container = document.createElement('main');
		document.body.appendChild(container);
		try {
			const { RetainedToggle: ServerToggle, InvalidPresence } = await server.ssrLoadModule(
				'/tests/_fixtures/retained-presence.tsrx',
			);
			const { renderToString } = await server.ssrLoadModule('octane/server');
			const record = vi.fn();
			container.innerHTML = (await renderToString(ServerToggle, { show: true, record })).html;
			const host = container.querySelector('#row');
			expect(host).not.toBeNull();
			const root = hydrateRoot(container, RetainedToggle, { show: true, record });
			await act(() => {});
			expect(container.querySelector('#row')).toBe(host);
			await act(() => root.unmount());
			expect(() => renderToString(InvalidPresence, { record })).toThrow(
				'one optional keyed element',
			);
		} finally {
			container.remove();
			await server.close();
		}
	}, 15_000);
});
