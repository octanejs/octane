import { afterEach, describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync } from '../src/index.js';

// Once any component registers a delegated event type, every native event of
// that type under the root reaches the delegated listener, including events
// whose path has no Octane handler. Those must keep native semantics end to
// end, and must not disturb handled events dispatched before or after them.
describe('delegated events without a handler on their path', () => {
	let outer: HTMLElement;
	afterEach(() => outer.remove());

	function setup(log: string[], props: Record<string, unknown> = {}) {
		outer = document.createElement('section');
		const container = document.createElement('div');
		outer.append(container);
		document.body.append(outer);
		const root = createRoot(container);
		flushSync(() =>
			root.render(
				createElement(
					'div',
					{ id: 'owner', ...props },
					createElement(
						'button',
						{
							id: 'handled',
							onClick: (event: MouseEvent) => {
								log.push(`handled:${(event.currentTarget as Element).id}`);
								event.stopPropagation();
							},
						},
						'handled',
					),
					createElement('span', { id: 'idle' }, 'idle'),
				),
			),
		);
		return { root, container };
	}

	function click(target: Element): MouseEvent {
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		target.dispatchEvent(event);
		return event;
	}

	it('keeps native currentTarget and stopPropagation for native listeners', () => {
		const log: string[] = [];
		const { root, container } = setup(log);
		const nativeStop = Event.prototype.stopPropagation;
		outer.addEventListener('click', (event) => {
			log.push(
				`outer:${(event.currentTarget as Element).localName}:` +
					`${Object.hasOwn(event, 'currentTarget')}:${event.stopPropagation === nativeStop}`,
			);
			event.stopPropagation();
		});
		const onDocument = () => log.push('document');
		document.addEventListener('click', onDocument);
		try {
			const idle = click(container.querySelector('#idle')!);
			expect(log).toEqual(['outer:section:false:true']);
			expect(idle.currentTarget).toBeNull();
			expect(Object.hasOwn(idle, 'stopPropagation')).toBe(false);

			// A handled event right after still gets Octane's propagation semantics:
			// the handler sees its own currentTarget and its stop reaches native.
			log.length = 0;
			const handled = click(container.querySelector('#handled')!);
			expect(log).toEqual(['handled:handled']);
			expect(handled.currentTarget).toBeNull();
			expect(Object.hasOwn(handled, 'currentTarget')).toBe(false);
			expect(Object.hasOwn(handled, 'stopPropagation')).toBe(false);
		} finally {
			document.removeEventListener('click', onDocument);
			root.unmount();
		}
	});

	it('still runs capture handlers when no bubble handler is on the path', () => {
		const log: string[] = [];
		const { root, container } = setup(log, {
			onClickCapture: (event: MouseEvent) =>
				log.push(`capture:${(event.currentTarget as Element).id}`),
		});
		const onDocument = (event: Event) =>
			log.push(`document:${Object.hasOwn(event, 'currentTarget')}`);
		document.addEventListener('click', onDocument);
		try {
			click(container.querySelector('#idle')!);
			expect(log).toEqual(['capture:owner', 'document:false']);
		} finally {
			document.removeEventListener('click', onDocument);
			root.unmount();
		}
	});

	it('runs a non-bubbling bubble handler when capture is registered off the path', () => {
		const log: string[] = [];
		outer = document.createElement('section');
		const container = document.createElement('div');
		outer.append(container);
		document.body.append(outer);
		const root = createRoot(container);
		flushSync(() =>
			root.render(
				createElement(
					'div',
					null,
					createElement('div', { id: 'elsewhere', onPlayCapture: () => log.push('elsewhere') }),
					createElement('video', {
						id: 'media',
						onPlay: (event: Event) => log.push(`play:${(event.currentTarget as Element).id}`),
					}),
				),
			),
		);
		try {
			const play = new Event('play', { bubbles: false });
			container.querySelector('#media')!.dispatchEvent(play);
			expect(log).toEqual(['play:media']);
			expect(Object.hasOwn(play, 'currentTarget')).toBe(false);
			expect(Object.hasOwn(play, 'stopPropagation')).toBe(false);
		} finally {
			root.unmount();
		}
	});

	it('skips handlers on disabled controls without leaking propagation state', () => {
		const log: string[] = [];
		outer = document.createElement('section');
		const container = document.createElement('div');
		outer.append(container);
		document.body.append(outer);
		const root = createRoot(container);
		flushSync(() =>
			root.render(
				createElement(
					'button',
					{ id: 'disabled', disabled: true, onClick: () => log.push('disabled') },
					createElement('span', { id: 'inside' }, 'inside'),
				),
			),
		);
		outer.addEventListener('click', (event) =>
			log.push(`outer:${Object.hasOwn(event, 'stopPropagation')}`),
		);
		try {
			click(container.querySelector('#inside')!);
			expect(log).toEqual(['outer:false']);
		} finally {
			root.unmount();
		}
	});
});
