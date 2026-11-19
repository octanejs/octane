import { resolve } from 'node:path';
import { motionValue } from 'motion';
import type { LegacyAnimationControls } from 'motion-dom';
import { act, hydrateRoot } from 'octane';
import { octane } from 'octane/compiler/vite';
import { createServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { ControllerGroup, ExternalController } from '../_fixtures/controller.tsrx';
import { RetainedControllerToggle } from '../_fixtures/retained-presence.tsrx';

describe('animation controls', () => {
	it.each(['subscribe', 'unsubscribe'] as const)(
		'releases the visual when external controls throw during %s',
		(phase) => {
			const x = motionValue(0);
			let subscribed: any;
			const report = vi.spyOn(console, 'error').mockImplementation(() => {});
			const controls = {
				start: () => Promise.resolve(),
				set() {},
				stop() {},
				mount: () => () => {},
				subscribe(visual: any) {
					subscribed = visual;
					if (phase === 'subscribe') throw new Error('subscribe failed');
					return () => {
						throw new Error('unsubscribe failed');
					};
				},
			} as LegacyAnimationControls;
			const r = mount(ExternalController, { controls, x });
			try {
				if (phase === 'subscribe') expect(subscribed.current).toBe(null);
				r.unmount();
				expect(subscribed.current).toBe(null);
				expect(report).toHaveBeenCalled();
			} finally {
				r.container.remove();
				report.mockRestore();
			}
		},
	);

	it.each([false, true])(
		'returns an interrupted retained exit to its authored base on controller reentry (swap: %s)',
		async (swap) => {
			let controls!: LegacyAnimationControls;
			const record = () => {},
				onReady = (value: LegacyAnimationControls) => {
					controls = value;
				};
			const r = mount(RetainedControllerToggle, { show: true, record, onReady });
			try {
				controls.set({ opacity: 1 });
				const host = r.find('#controller-exit') as HTMLElement;
				r.update(RetainedControllerToggle, { show: false, record, onReady });
				await new Promise((resolve) => setTimeout(resolve, 50));
				expect(Number(host.style.opacity)).toBeGreaterThan(0);
				r.update(RetainedControllerToggle, { show: true, record, onReady, forceSecond: swap });
				await new Promise((resolve) => setTimeout(resolve, 220));
				expect(r.find('#controller-exit')).toBe(host);
				expect(host.style.opacity).toBe('0');
			} finally {
				r.unmount();
			}
		},
	);

	it('lets a controller command issued at reentry replace the authored-base fallback', async () => {
		let controls!: LegacyAnimationControls;
		const record = () => {},
			onReady = (value: LegacyAnimationControls) => {
				controls = value;
			};
		const r = mount(RetainedControllerToggle, { show: true, record, onReady });
		try {
			controls.set({ opacity: 1 });
			r.update(RetainedControllerToggle, { show: false, record, onReady });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(RetainedControllerToggle, { show: true, record, onReady });
			void controls.start({ opacity: 0.8, transition: { duration: 0.05 } });
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect((r.find('#controller-exit') as HTMLElement).style.opacity).toBe('0.8');
		} finally {
			r.unmount();
		}
	});

	it('continues an active retained fallback after a later controller replacement', async () => {
		let controls!: LegacyAnimationControls;
		const record = () => {},
			onReady = (value: LegacyAnimationControls) => {
				controls = value;
			};
		const r = mount(RetainedControllerToggle, { show: true, record, onReady });
		try {
			controls.set({ opacity: 1 });
			r.update(RetainedControllerToggle, { show: false, record, onReady });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(RetainedControllerToggle, { show: true, record, onReady });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(RetainedControllerToggle, { show: true, record, onReady, forceSecond: true });
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect((r.find('#controller-exit') as HTMLElement).style.opacity).toBe('0');
		} finally {
			r.unmount();
		}
	});

	it('does not revive a fallback superseded by a newer controller animation', async () => {
		let controls!: LegacyAnimationControls;
		const record = () => {},
			onReady = (value: LegacyAnimationControls) => {
				controls = value;
			};
		const r = mount(RetainedControllerToggle, { show: true, record, onReady });
		try {
			controls.set({ opacity: 1 });
			r.update(RetainedControllerToggle, { show: false, record, onReady });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(RetainedControllerToggle, { show: true, record, onReady });
			await controls.start({ opacity: 0.8, transition: { duration: 0.02 } });
			r.update(RetainedControllerToggle, { show: true, record, onReady, forceSecond: true });
			await new Promise((resolve) => setTimeout(resolve, 180));
			expect((r.find('#controller-exit') as HTMLElement).style.opacity).toBe('0.8');
		} finally {
			r.unmount();
		}
	});

	it('does not revive a completed fallback after a controller replacement', async () => {
		let controls!: LegacyAnimationControls;
		const record = () => {},
			onReady = (value: LegacyAnimationControls) => {
				controls = value;
			};
		const r = mount(RetainedControllerToggle, { show: true, record, onReady });
		try {
			controls.set({ opacity: 1 });
			r.update(RetainedControllerToggle, { show: false, record, onReady });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(RetainedControllerToggle, { show: true, record, onReady });
			await new Promise((resolve) => setTimeout(resolve, 220));
			controls.set({ opacity: 0.7 });
			r.update(RetainedControllerToggle, { show: true, record, onReady, forceSecond: true });
			await new Promise((resolve) => setTimeout(resolve, 180));
			expect((r.find('#controller-exit') as HTMLElement).style.opacity).toBe('0.7');
		} finally {
			r.unmount();
		}
	});
	it('starts a variant for every committed host using each host’s variants', async () => {
		let controls!: LegacyAnimationControls;
		const onReady = (first: LegacyAnimationControls) => {
			controls = first;
		};
		const r = mount(ControllerGroup, {
			rows: [
				{ id: 'one', target: 20 },
				{ id: 'two', target: 40 },
			],
			onReady,
		});
		try {
			await controls.start('layout', { duration: 0 });
			await nextPaint();
			expect(r.find('#one').style.marginTop).toBe('20px');
			expect(r.find('#two').style.marginTop).toBe('40px');
		} finally {
			r.unmount();
		}
	});

	it('starts from the committed initial variant instead of engine defaults', async () => {
		let controls!: LegacyAnimationControls;
		const r = mount(ControllerGroup, {
			rows: [
				{ id: 'one', target: 20, value: 0, initial: { opacity: 0.6, scale: 0.7, x: [100, 150] } },
			],
			onReady(first: LegacyAnimationControls) {
				controls = first;
			},
		});
		try {
			expect(r.find('#one').style.transform).toContain('translateX(100px)');
			expect(r.find('#one').style.opacity).toBe('0.6');
			void controls.start({ opacity: 1, scale: 1, x: 200 }, { duration: 10, ease: 'linear' });
			await new Promise((resolve) => setTimeout(resolve, 80));
			await nextPaint();
			const x = Number(r.find('#one').style.transform.match(/translateX\(([-\d.]+)px\)/)?.[1]);
			expect(x).toBeGreaterThanOrEqual(100);
			expect(x).toBeLessThan(200);
		} finally {
			controls.stop();
			r.unmount();
		}
	});

	it('restores controller gesture keys by priority and their authored base', async () => {
		let controls!: LegacyAnimationControls;
		const x = motionValue(10),
			y = motionValue(20);
		const r = mount(ControllerGroup, {
			rows: [
				{
					id: 'one',
					target: 20,
					value: x,
					yValue: y,
					whileFocus: { x: 300, y: 400 },
					whileHover: { x: 200 },
					whileTap: { x: 500 },
				},
			],
			onReady(first: LegacyAnimationControls) {
				controls = first;
			},
		});
		const host = r.find('#one') as HTMLElement;
		const wait = () => new Promise((resolve) => setTimeout(resolve, 45));
		const pointer = (target: EventTarget, type: string) =>
			target.dispatchEvent(
				Object.assign(new Event(type, { bubbles: true }), {
					pointerType: 'mouse',
					button: 0,
					isPrimary: true,
				}),
			);
		try {
			controls.set({ x: 100 });
			host.focus();
			await wait();
			expect([x.get(), y.get()]).toEqual([300, 400]);
			pointer(host, 'pointerenter');
			await wait();
			expect(x.get()).toBe(200);
			host.blur();
			await wait();
			expect([x.get(), y.get()]).toEqual([200, 20]);
			host.focus();
			await wait();
			expect([x.get(), y.get()]).toEqual([200, 400]);
			host.blur();
			await wait();
			expect([x.get(), y.get()]).toEqual([200, 20]);
			pointer(host, 'pointerdown');
			await wait();
			expect(x.get()).toBe(500);
			pointer(window, 'pointercancel');
			await wait();
			expect(x.get()).toBe(200);
			pointer(host, 'pointerleave');
			await wait();
			expect(x.get()).toBe(10);
			host.focus();
			await wait();
			controls.set({ x: 150 });
			expect(x.get()).toBe(150);
			host.blur();
			await wait();
			expect(x.get()).toBe(10);
		} finally {
			r.unmount();
		}
	});

	it.each(['target drop', 'controller rebind'] as const)(
		'restores activated keys after %s during focus',
		async (change) => {
			const x = motionValue(10),
				y = motionValue(20);
			const row = { id: 'one', target: 20, value: x, yValue: y, whileFocus: { x: 300 } };
			const onReady = () => {};
			const r = mount(ControllerGroup, { rows: [row], onReady });
			const host = r.find('#one') as HTMLElement;
			try {
				host.focus();
				await new Promise((resolve) => setTimeout(resolve, 45));
				expect(x.get()).toBe(300);
				r.update(ControllerGroup, {
					rows: [change === 'target drop' ? { ...row, whileFocus: { y: 400 } } : row],
					second: change === 'controller rebind',
					onReady,
				});
				host.blur();
				await new Promise((resolve) => setTimeout(resolve, 45));
				expect([x.get(), y.get()]).toEqual([10, 20]);
			} finally {
				r.unmount();
			}
		},
	);

	it('leaves a gesture value in place when a controller host has no authored base', async () => {
		const r = mount(ControllerGroup, {
			rows: [{ id: 'one', target: 20, whileFocus: { x: 200 } }],
			onReady() {},
		});
		const host = r.find('#one') as HTMLElement;
		try {
			host.focus();
			await new Promise((resolve) => setTimeout(resolve, 45));
			expect(host.style.transform).toContain('translateX(200px)');
			host.blur();
			await new Promise((resolve) => setTimeout(resolve, 45));
			expect(host.style.transform).toContain('translateX(200px)');
		} finally {
			r.unmount();
		}
	});

	it('keeps declarative gesture restoration on its existing base target', async () => {
		const r = mount(ControllerGroup, {
			disabled: true,
			rows: [{ id: 'one', target: 20, initial: { x: 10 }, whileFocus: { x: 200 } }],
			onReady() {},
		});
		const host = r.find('#one') as HTMLElement;
		try {
			host.focus();
			await new Promise((resolve) => setTimeout(resolve, 45));
			expect(host.style.transform).toContain('translateX(200px)');
			host.blur();
			await new Promise((resolve) => setTimeout(resolve, 45));
			expect(host.style.transform).toContain('translateX(10px)');
		} finally {
			r.unmount();
		}
	});

	it('retains the current controller value when rebinding a mounted host', () => {
		let first!: LegacyAnimationControls;
		let second!: LegacyAnimationControls;
		const onReady = (a: LegacyAnimationControls, b: LegacyAnimationControls) => {
			first = a;
			second = b;
		};
		const value = motionValue(0);
		const rows = [{ id: 'one', target: 20, value, initial: { x: 100 } }];
		const r = mount(ControllerGroup, { rows, onReady });
		try {
			first.set({ x: 130 });
			r.update(ControllerGroup, { rows, second: true, onReady });
			void second.start({ x: 200 }, { duration: 1 });
			expect(value.get()).toBe(130);
		} finally {
			second.stop();
			r.unmount();
		}
	});

	it('applies a style first supplied after the initial controller frame', async () => {
		let controls!: LegacyAnimationControls;
		const onReady = (first: LegacyAnimationControls) => {
			controls = first;
		};
		const r = mount(ControllerGroup, {
			rows: [{ id: 'one', target: 20, initial: { x: 100 } }],
			onReady,
		});
		try {
			r.update(ControllerGroup, {
				rows: [{ id: 'one', target: 20, value: 200, initial: { x: 100 } }],
				onReady,
			});
			expect(r.find('#one').style.transform).toContain('translateX(200px)');
			void controls.start({ x: 300 }, { duration: 10, ease: 'linear' });
			await new Promise((resolve) => setTimeout(resolve, 80));
			await nextPaint();
			const x = Number(r.find('#one').style.transform.match(/translateX\(([-\d.]+)px\)/)?.[1]);
			expect(x).toBeGreaterThanOrEqual(200);
			expect(x).toBeLessThan(300);
		} finally {
			controls.stop();
			r.unmount();
		}
	});

	it('honors a fresh MotionValue supplied during a controller replacement', () => {
		let first!: LegacyAnimationControls;
		let second!: LegacyAnimationControls;
		const onReady = (a: LegacyAnimationControls, b: LegacyAnimationControls) => {
			first = a;
			second = b;
		};
		const oldValue = motionValue(0);
		const fresh = motionValue(50);
		const r = mount(ControllerGroup, {
			rows: [{ id: 'one', target: 20, value: oldValue }],
			onReady,
		});
		try {
			first.set({ x: 130 });
			r.update(ControllerGroup, {
				rows: [{ id: 'one', target: 20, value: fresh }],
				second: true,
				onReady,
			});
			expect(fresh.get()).toBe(50);
			void second.start({ x: 200 }, { duration: 1 });
			expect(fresh.get()).toBe(50);
		} finally {
			second.stop();
			r.unmount();
		}
	});

	it('uses updated committed variants and unsubscribes removed or rebound hosts', async () => {
		let first!: LegacyAnimationControls;
		let second!: LegacyAnimationControls;
		const onReady = (a: LegacyAnimationControls, b: LegacyAnimationControls) => {
			first = a;
			second = b;
		};
		const rows = [
			{ id: 'one', target: 20 },
			{ id: 'two', target: 40 },
		];
		const r = mount(ControllerGroup, { rows, onReady });
		try {
			first.set('layout');
			await nextPaint();
			const detached = r.find('#two');
			r.update(ControllerGroup, { rows: [{ id: 'one', target: 25 }], onReady });
			first.set('layout');
			await nextPaint();
			expect(r.find('#one').style.marginTop).toBe('25px');
			expect(detached.style.marginTop).toBe('40px');

			r.update(ControllerGroup, { rows: [{ id: 'one', target: 30 }], second: true, onReady });
			first.set({ marginTop: 99 });
			await nextPaint();
			expect(r.find('#one').style.marginTop).toBe('25px');
			second.set('layout');
			await nextPaint();
			expect(r.find('#one').style.marginTop).toBe('30px');
			r.update(ControllerGroup, { rows: [{ id: 'one', target: 30 }], disabled: true, onReady });
			second.set({ marginTop: 90 });
			await nextPaint();
			expect(r.find('#one').style.marginTop).not.toBe('90px');
		} finally {
			r.unmount();
		}
	});

	it('sets authored values synchronously and stops their running animations', async () => {
		let controls!: LegacyAnimationControls;
		const value = motionValue(0);
		const onReady = (first: LegacyAnimationControls) => {
			controls = first;
		};
		const r = mount(ControllerGroup, { rows: [{ id: 'one', target: 20, value }], onReady });
		try {
			controls.set({ x: 17 });
			expect(value.get()).toBe(17);
			void controls.start({ x: 100 }, { duration: 1 });
			expect(value.isAnimating()).toBe(true);
			controls.stop();
			expect(value.isAnimating()).toBe(false);
		} finally {
			r.unmount();
		}
	});

	it('uses the SVG visual element for authored attribute values', async () => {
		let controls!: LegacyAnimationControls;
		const circle = motionValue(5);
		const onReady = (first: LegacyAnimationControls) => {
			controls = first;
		};
		const r = mount(ControllerGroup, { rows: [], circle, circleInitial: { cx: [9, 12] }, onReady });
		try {
			expect(circle.get()).toBe(9);
			expect(r.container.querySelector('#circle')?.getAttribute('cx')).toBe('9');
			void controls.start({ cx: 18 }, { duration: 1 });
			expect(circle.get()).toBe(9);
			controls.stop();
			controls.set('layout');
			expect(circle.get()).toBe(18);
			await nextPaint();
			expect(r.container.querySelector('#circle')?.getAttribute('cx')).toBe('18');
		} finally {
			r.unmount();
		}
	});

	it('adopts server-rendered controller hosts and subscribes them during hydration', async () => {
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
			const { ControllerGroup: ServerGroup } = await server.ssrLoadModule(
				'/tests/_fixtures/controller.tsrx',
			);
			const { renderToString } = await server.ssrLoadModule('octane/server');
			const rows = [{ id: 'one', target: 20 }];
			container.innerHTML = (await renderToString(ServerGroup, { rows, onReady() {} })).html;
			const host = container.querySelector('#one');
			let controls!: LegacyAnimationControls;
			const onReady = (first: LegacyAnimationControls) => {
				controls = first;
			};
			const root = hydrateRoot(container, ControllerGroup, { rows, onReady });
			await act(() => {});
			expect(container.querySelector('#one')).toBe(host);
			controls.set('layout');
			await nextPaint();
			expect((host as HTMLElement).style.marginTop).toBe('20px');
			await act(() => root.unmount());
		} finally {
			container.remove();
			await server.close();
		}
	}, 15_000);
});
