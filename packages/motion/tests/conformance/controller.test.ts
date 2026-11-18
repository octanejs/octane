import { resolve } from 'node:path';
import { motionValue } from 'motion';
import type { LegacyAnimationControls } from 'motion-dom';
import { act, hydrateRoot } from 'octane';
import { octane } from 'octane/compiler/vite';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { ControllerGroup } from '../_fixtures/controller.tsrx';

describe('animation controls', () => {
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
		const r = mount(ControllerGroup, { rows: [], circle, onReady });
		try {
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
