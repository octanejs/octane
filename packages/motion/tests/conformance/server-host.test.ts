import { resolve } from 'node:path';
import { motionValue } from 'motion';
import { act, hydrateRoot } from 'octane';
import { octane } from 'octane/compiler/vite';
import { createServer } from 'vite';
import { expect, it, vi } from 'vitest';
import { mount } from '../_helpers';
import { AuthoredFrame, ServerHost } from '../_fixtures/server-host.tsrx';

it('hydrates the server motion host with its first-frame style, children and ref intact', async () => {
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
		const { ServerHost: ServerView, VisualStates } = await server.ssrLoadModule(
			'/tests/_fixtures/server-host.tsrx',
		);
		const { renderToString } = await server.ssrLoadModule('octane/server');
		container.innerHTML = (await renderToString(VisualStates, {})).html;
		expect(container.querySelector<HTMLElement>('#template')?.style.transform).toBe('scale(2)');
		expect(container.querySelector<HTMLElement>('#variants')?.style.transform).toBe(
			'translateX(8px)',
		);
		expect(container.querySelector<HTMLElement>('#variants')?.style.opacity).toBe('0.5');
		expect(container.querySelector('#variants')?.hasAttribute('custom')).toBe(false);
		expect(container.querySelector<HTMLElement>('#inherited-end')?.style.opacity).toBe('0.9');
		const inheritedList = container.querySelector<HTMLElement>('#inherited-list')!;
		expect(inheritedList.style.opacity).toBe('0.25');
		expect(inheritedList.style.transform).toBe('translateX(3px)');
		expect(container.querySelector('circle')?.getAttribute('cx')).toBe('12');
		container.innerHTML = (await renderToString(ServerView, { label: 'First' })).html;
		const host = container.querySelector('div')!;
		const svg = host.querySelector('svg');
		expect(host.style.opacity).toBe('1');
		expect(host.style.transform).toBe('translateX(12px)');
		expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');

		const cleanup = vi.fn();
		const hostRef = vi.fn(() => cleanup);
		const root = hydrateRoot(container, ServerHost, { hostRef, label: 'First' });
		await act(() => {});
		expect(hostRef).toHaveBeenCalledExactlyOnceWith(host);
		await new Promise<void>((done) =>
			requestAnimationFrame(() => requestAnimationFrame(() => done())),
		);
		expect(host.style.opacity).toBe('1');
		const nextRef = { current: null };
		await act(() => root.render(ServerHost, { hostRef: nextRef, label: 'Second' }));
		expect(host.getAttribute('aria-label')).toBe('Second');
		expect(host.querySelector('svg')).toBe(svg);
		expect(nextRef.current).toBe(host);
		expect(cleanup).toHaveBeenCalledTimes(1);
		await act(() => root.unmount());
		expect(nextRef.current).toBeNull();
	} finally {
		container.remove();
		await server.close();
	}
});

it('releases a first-frame style and SVG attribute once authored props change', async () => {
	const r = mount(AuthoredFrame, { opacity: 0.2, cx: 2, animate: true });
	try {
		const host = r.container.querySelector('div')!;
		const circle = host.querySelector('circle')!;
		const values = () => [host.style.opacity, circle.getAttribute('cx')];
		expect(values()).toEqual(['0.6', '6']);
		await act(() => r.update(AuthoredFrame, { opacity: 0.8, cx: 8, animate: false }));
		expect(values()).toEqual(['0.8', '8']);
		await act(() => r.update(AuthoredFrame, { opacity: 0.2, cx: 2, animate: false }));
		expect(values()).toEqual(['0.2', '2']);
		await act(() => r.update(AuthoredFrame, { animate: false }));
		expect(values()).toEqual(['', null]);
	} finally {
		r.unmount();
	}
});

it('clears an initial MotionValue after a static style takes ownership and is removed', async () => {
	const r = mount(AuthoredFrame, { opacity: motionValue(0.2), animate: false });
	try {
		const host = r.container.querySelector('div')!;
		expect(host.style.opacity).toBe('0.2');
		await act(() => r.update(AuthoredFrame, { opacity: 0.75, animate: false }));
		expect(host.style.opacity).toBe('0.75');
		await act(() => r.update(AuthoredFrame, { animate: false }));
		expect(host.style.opacity).toBe('');
	} finally {
		r.unmount();
	}
});

it.each([
	['MotionValue', 'number', '2'],
	['MotionValue', 'MotionValue', '6'],
	['number', 'MotionValue', '6'],
	['MotionValue', 'updated MotionValue', '8'],
] as const)(
	'handles a first-frame SVG attribute changing from %s to %s',
	async (original, replacement, expected) => {
		const cx = motionValue(2);
		const initial = original === 'number' ? 2 : cx;
		const r = mount(AuthoredFrame, { cx: initial, animate: true });
		try {
			const circle = r.container.querySelector('circle')!;
			expect(circle.getAttribute('cx')).toBe('6');
			await act(() => r.update(AuthoredFrame, { cx: initial, animate: false }));
			expect(circle.getAttribute('cx')).toBe('6');
			if (replacement === 'updated MotionValue') cx.set(8);
			const next =
				replacement === 'number' ? 2 : replacement === 'MotionValue' ? motionValue(2) : cx;
			await act(() => r.update(AuthoredFrame, { cx: next, animate: false }));
			expect(r.container.querySelector('circle')).toBe(circle);
			expect(circle.getAttribute('cx')).toBe(expected);
		} finally {
			r.unmount();
		}
	},
);
