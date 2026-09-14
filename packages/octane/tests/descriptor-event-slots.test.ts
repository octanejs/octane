import { describe, expect, it, vi } from 'vitest';
import { createElement as h, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import * as Server from 'octane/server';
import { act, mount } from './_helpers.js';

const fire = (element: Element, type: string) => {
	const event = new Event(type, { bubbles: true, cancelable: true });
	element.dispatchEvent(event);
	return event;
};

describe('descriptor native event names', () => {
	it.each([
		['Focus', 'focusin'],
		['Blur', 'focusout'],
		['DoubleClick', 'dblclick'],
		['GotPointerCapture', 'gotpointercapture'],
		['LostPointerCapture', 'lostpointercapture'],
	])('preserves %s phases, current targets, updates, and removal', (name, type) => {
		const calls: Array<[string, Event, EventTarget | null]> = [];
		const App = ({
			label,
			capture,
			active = true,
		}: {
			label: string;
			capture: boolean;
			active?: boolean;
		}) => {
			const props = (position: string) =>
				active
					? {
							['on' + name]: (event: Event) =>
								calls.push([label + position, event, event.currentTarget]),
							...(capture
								? {
										['on' + name + 'Capture']: (event: Event) =>
											calls.push([label + position + ' capture', event, event.currentTarget]),
									}
								: {}),
						}
					: {};
			return h('section', props(' parent'), h('button', props(' child'), 'event'));
		};
		const view = mount(App, { label: 'first', capture: true });
		const parent = view.find('section');
		const child = view.find('button');
		try {
			const first = fire(child, type);
			expect(calls).toEqual([
				['first parent capture', first, parent],
				['first child capture', first, child],
				['first child', first, child],
				['first parent', first, parent],
			]);
			calls.length = 0;
			view.update(App, { label: 'next', capture: false });
			expect(view.find('button')).toBe(child);
			const next = fire(child, type);
			expect(calls).toEqual([
				['next child', next, child],
				['next parent', next, parent],
			]);
			view.update(App, { label: 'removed', capture: false, active: false });
			expect(view.find('button')).toBe(child);
			calls.length = 0;
			fire(view.find('button'), type);
			expect(calls).toEqual([]);
		} finally {
			view.unmount();
		}
		fire(child, type);
		expect(calls).toEqual([]);
	});

	it('keeps custom event spelling distinct from native aliases after earlier ordinary hosts', () => {
		const calls: string[] = [];
		const App = ({ tag, label, active = true }: { tag: string; label: string; active?: boolean }) =>
			h(
				tag,
				active
					? {
							onAuditMixed: () => calls.push(label + ' custom'),
							onDblClick: () => calls.push(label + ' alias'),
							onFocus: () => calls.push(label + ' focus'),
						}
					: {},
			);
		const native = mount(App, { tag: 'button', label: 'native' });
		try {
			fire(native.find('button'), 'auditmixed');
			fire(native.find('button'), 'dblclick');
			fire(native.find('button'), 'focusin');
		} finally {
			native.unmount();
		}
		const custom = mount(App, { tag: 'descriptor-event-host', label: 'custom' });
		try {
			const element = custom.find('descriptor-event-host');
			fire(element, 'auditmixed');
			fire(element, 'dblclick');
			expect(calls).toEqual(['native custom', 'native alias', 'native focus']);
			fire(element, 'AuditMixed');
			fire(element, 'DblClick');
			fire(element, 'focusin');
			expect(calls.slice(3)).toEqual(['custom custom', 'custom alias', 'custom focus']);
			custom.update(App, { tag: 'descriptor-event-host', label: 'removed', active: false });
			expect(custom.find('descriptor-event-host')).toBe(element);
			calls.length = 0;
			fire(custom.find('descriptor-event-host'), 'AuditMixed');
			fire(custom.find('descriptor-event-host'), 'DblClick');
			fire(custom.find('descriptor-event-host'), 'focusin');
			expect(calls).toEqual([]);
		} finally {
			custom.unmount();
		}
	});

	it('adopts server hosts and installs both phases in subsequent roots', () => {
		const calls: string[] = [];
		const props = {
			onDoubleClick: () => calls.push('bubble'),
			onDoubleClickCapture: () => calls.push('capture'),
		};
		const App = () => h('button', props, 'event');
		const initial = mount(App);
		fire(initial.find('button'), 'dblclick');
		initial.unmount();
		const container = document.createElement('div');
		container.innerHTML = Server.renderToString(() =>
			Server.createElement('button', props, 'event'),
		).html;
		document.body.append(container);
		const button = container.querySelector('button')!;
		expect(button.hasAttribute('ondoubleclick')).toBe(false);
		expect(button.hasAttribute('ondoubleclickcapture')).toBe(false);
		const root = hydrateRoot(container, App);
		try {
			expect(container.querySelector('button')).toBe(button);
			fire(button, 'dblclick');
			expect(calls).toEqual(['capture', 'bubble', 'capture', 'bubble']);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('validates an invalid handler even after the same event name had a valid listener', () => {
		const App = ({ listener }: { listener: unknown }) =>
			h('button', { onDoubleClickCapture: listener }, 'event');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const uncaught: Error[] = [];
		const onError = (event: ErrorEvent) => {
			uncaught.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		const view = mount(App, { listener: () => {} });
		try {
			view.update(App, { listener: 'invalid' });
			const prod = process.env.NODE_ENV === 'production';
			expect(error.mock.calls).toEqual(
				prod
					? []
					: [
							[
								'Expected `onDoubleClickCapture` listener to be a function, instead got a value of `string` type.',
							],
						],
			);
			fire(view.find('button'), 'dblclick');
			expect(uncaught).toHaveLength(1);
			expect(uncaught[0]!.message).toContain('listener to be a function');
		} finally {
			view.unmount();
			window.removeEventListener('error', onError);
			error.mockRestore();
		}
	});

	it('restores both accepted phases when a later child suspends', async () => {
		const calls: string[] = [];
		let ready = false;
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = done;
		});
		const Later = ({ hold }: { hold: boolean }) => {
			if (hold && !ready) throw pending;
			return null;
		};
		const App = ({ label, hold }: { label: string; hold: boolean }) =>
			h(
				'main',
				null,
				h(
					'button',
					{
						onDoubleClick: () => calls.push(label + ' bubble'),
						onDoubleClickCapture: () => calls.push(label + ' capture'),
					},
					label,
				),
				h(Later, { hold }),
			);
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			root.render(App, { label: 'first', hold: false });
			const button = container.querySelector('button')!;
			flushSync(() => root.render(App, { label: 'next', hold: true }));
			expect(button.textContent).toBe('first');
			fire(button, 'dblclick');
			await act(async () => {
				ready = true;
				resolve();
				await pending;
			});
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('next');
			fire(button, 'dblclick');
			expect(calls).toEqual(['first capture', 'first bubble', 'next capture', 'next bubble']);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
