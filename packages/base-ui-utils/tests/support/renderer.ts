import {
	cloneElement,
	createElement,
	act,
	type ElementDescriptor,
	type ComponentBody,
} from 'octane';
import { render as mount, cleanup } from '@octanejs/testing-library';
import { renderToString as serverRender } from 'octane/server';
import userEvent from '@testing-library/user-event';
import { onTestFinished } from 'vitest';
export { act } from 'octane';
export { screen, fireEvent, waitFor } from '@octanejs/testing-library';

const serverComponents = new WeakMap<ComponentBody, ComponentBody>();
export function registerServerComponent(client: ComponentBody, server: ComponentBody) {
	serverComponents.set(client, server);
}

export function createRenderer() {
	function render(element: ElementDescriptor, options: Parameters<typeof mount>[1] = {}) {
		let current = element;
		const result = mount(current, options);
		return {
			...result,
			user: userEvent.setup(),
			setProps(props: object) {
				current = cloneElement(current, props);
				result.rerender(current);
			},
		};
	}
	return {
		render,
		renderToString(element: ElementDescriptor) {
			const server =
				typeof element.type === 'function' ? serverComponents.get(element.type) : undefined;
			if (!server)
				throw new Error('Register the matching server-compiled fixture before rendering it.');
			const container = document.createElement('div');
			document.body.appendChild(container);
			onTestFinished(() => container.remove());
			container.innerHTML = serverRender(server, element.props).html;
			return { container, hydrate: () => render(element, { container, hydrate: true }) };
		},
	};
}
export type MuiRenderResult = ReturnType<ReturnType<typeof createRenderer>['render']>;
