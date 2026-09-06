import { act, cloneElement, type ElementDescriptor, type ComponentBody } from 'octane';
import { renderToString as serverRender } from 'octane/server';
import { render as mount, fireEvent } from '@octanejs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, onTestFinished, vi } from 'vitest';
export { act } from 'octane';
export { screen, fireEvent, createEvent, within, waitFor } from '@octanejs/testing-library';
export { default as createDescribe } from '@mui/internal-test-utils/createDescribe';
export const randomStringValue = () => crypto.randomUUID();
// Tests use this feature-level branch for modern ID and ref semantics.
export const reactMajor = 19;
export const flushMicrotasks = () => act(async () => {});

const serverComponents = new WeakMap<ComponentBody, ComponentBody>();
export function registerServerComponent(client: ComponentBody, server: ComponentBody) {
	serverComponents.set(client, server);
}

export function ignoreActWarnings() {
	const original = console.error;
	console.error = (...args: unknown[]) => {
		if (typeof args[0] === 'string' && args[0].includes('was not wrapped in act(')) return;
		original(...args);
	};
	onTestFinished(() => {
		console.error = original;
	});
}

export function createRenderer(
	options: {
		clock?: 'real' | 'fake';
		clockConfig?: number | Date;
		clockOptions?: Parameters<typeof vi.useFakeTimers>[0];
	} = {},
) {
	const fake = () =>
		vi.useFakeTimers({
			toFake: [
				'setTimeout',
				'clearTimeout',
				'setInterval',
				'clearInterval',
				'requestAnimationFrame',
				'cancelAnimationFrame',
				'performance',
				'Date',
			],
			shouldClearNativeTimers: true,
			now: options.clockConfig,
			...options.clockOptions,
		});
	if (options.clock === 'fake') beforeEach(fake);
	const clock = {
		withFakeTimers() {
			beforeEach(fake);
		},
		tick(ms: number) {
			return act(() => {
				vi.advanceTimersByTime(ms);
			});
		},
		tickAsync(ms: number) {
			return act(async () => {
				await vi.advanceTimersByTimeAsync(ms);
			});
		},
		runAll() {
			return act(() => {
				vi.runAllTimers();
			});
		},
		runToLast() {
			return act(() => {
				vi.runOnlyPendingTimers();
			});
		},
		restore() {
			vi.useRealTimers();
		},
		isReal() {
			return !vi.isFakeTimers();
		},
	};
	function render(element: ElementDescriptor, config: Parameters<typeof mount>[1] = {}) {
		const result = mount(element, config);
		return {
			...result,
			user: userEvent.setup(),
			setProps(props: object) {
				result.rerender(cloneElement(element, props));
			},
			setPropsAsync(props: object) {
				return act(async () => {
					result.rerender(cloneElement(element, props));
				});
			},
			forceUpdate() {
				result.rerender(cloneElement(element, {}));
			},
		};
	}
	return {
		render,
		clock,
		renderToString(element: ElementDescriptor, serverProps = element.props) {
			const server =
				typeof element.type === 'function' ? serverComponents.get(element.type) : undefined;
			if (!server)
				throw new Error('Register the matching server-compiled fixture before rendering it.');
			const container = document.createElement('div');
			document.body.appendChild(container);
			onTestFinished(() => container.remove());
			container.innerHTML = serverRender(server, serverProps).html;
			return { container, hydrate: () => render(element, { container, hydrate: true }) };
		},
	};
}
export const render = (element: ElementDescriptor, options?: Parameters<typeof mount>[1]) =>
	mount(element, options);
export type MuiRenderResult = ReturnType<ReturnType<typeof createRenderer>['render']>;
export type RenderOptions = Parameters<typeof mount>[1];
export type CreateRendererOptions = Parameters<typeof createRenderer>[0];
export type Renderer = ReturnType<typeof createRenderer>;
