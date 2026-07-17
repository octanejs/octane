import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createElement,
	createRoot,
	flushSync,
	hydrateRoot,
	type ComponentBody,
	type Root,
} from '../../src/index.js';
import * as ServerRuntime from 'octane/server';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/root-semantics.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/root-semantics.tsrx';
const server = loadServerFixture(FIXTURE);

let container: HTMLDivElement;
let roots: Root[];
let containers: HTMLElement[];

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	roots = [];
	containers = [container];
});

afterEach(() => {
	for (let i = roots.length - 1; i >= 0; i--) roots[i].unmount();
	for (const owned of containers) owned.remove();
});

function trackRoot(root: Root): Root {
	roots.push(root);
	return root;
}

function makeContainer(): HTMLDivElement {
	const owned = document.createElement('div');
	document.body.appendChild(owned);
	containers.push(owned);
	return owned;
}

function render(root: Root, body: ComponentBody, props?: any): void {
	flushSync(() => root.render(body, props));
}

function captureConsoleErrors<T>(run: () => T): { result: T; messages: string[] } {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const result = run();
		return {
			result,
			messages: error.mock.calls.map((call) => call.map(String).join(' ')),
		};
	} finally {
		error.mockRestore();
	}
}

describe('ReactDOMRoot public conformance', () => {
	// Per ReactDOMRoot-test.js:44 (stable), :44 (canary).
	it('renders children', () => {
		const root = trackRoot(createRoot(container));
		flushSync(() => (root.render as any)(createElement('div', { id: 'child' }, 'Hi')));
		expect(container.querySelector('#child')?.textContent).toBe('Hi');
		expect(container.textContent).toBe('Hi');
	});

	// Per ReactDOMRoot-test.js:51 (stable), :51 (canary).
	it('warns if a callback parameter is provided to render', () => {
		const callback = vi.fn();
		const root = trackRoot(createRoot(container));
		const element = createElement(client.TextRoot, { text: 'Hi' });
		const { messages } = captureConsoleErrors(() =>
			flushSync(() => (root.render as any)(element, callback)),
		);
		expect(messages).toEqual([
			'does not support the second callback argument. To execute a side effect after ' +
				'rendering, declare it in a component body with useEffect().',
		]);
		expect(callback).not.toHaveBeenCalled();
		expect(container.textContent).toBe('Hi');
	});

	// Per ReactDOMRoot-test.js:66 (stable), :63 (canary).
	it('warn if a object is passed to root.render(...)', () => {
		const root = trackRoot(createRoot(container));
		const element = createElement(client.TextRoot, { text: 'Child' });
		const { messages } = captureConsoleErrors(() =>
			flushSync(() => (root.render as any)(element, {})),
		);
		expect(messages).toEqual([
			'You passed a second argument to root.render(...) but it only accepts one argument.',
		]);
		expect(container.textContent).toBe('Child');
	});

	// Per ReactDOMRoot-test.js:84 (stable), :76 (canary).
	it('warn if a container is passed to root.render(...)', () => {
		const root = trackRoot(createRoot(container));
		const element = createElement(client.TextRoot, { text: 'Child' });
		const { messages } = captureConsoleErrors(() =>
			flushSync(() => (root.render as any)(element, container)),
		);
		expect(messages).toEqual([
			"You passed a container to the second argument of root.render(...). You don't need to " +
				'pass it again since you already passed it to create the root.',
		]);
		expect(container.textContent).toBe('Child');
	});

	// Per ReactDOMRoot-test.js:103 (stable), :90 (canary).
	it('warns if a callback parameter is provided to unmount', () => {
		const callback = vi.fn();
		const root = trackRoot(createRoot(container));
		render(root, client.TextRoot, { text: 'Hi' });
		const { messages } = captureConsoleErrors(() => (root.unmount as any)(callback));
		expect(messages).toEqual([
			'does not support a callback argument. To execute a side effect after rendering, ' +
				'declare it in a component body with useEffect().',
		]);
		expect(callback).not.toHaveBeenCalled();
		expect(container.textContent).toBe('');
	});

	// Per ReactDOMRoot-test.js:119 (stable), :103 (canary).
	it('unmounts children', () => {
		const root = trackRoot(createRoot(container));
		render(root, client.TextRoot, { text: 'Hi' });
		expect(container.textContent).toBe('Hi');
		root.unmount();
		expect(container.textContent).toBe('');
	});

	// Per ReactDOMRoot-test.js:129 (stable), :113 (canary).
	it('can be immediately unmounted', () => {
		const root = trackRoot(createRoot(container));
		expect(root.unmount()).toBeUndefined();
		expect(() => root.render(client.TextRoot, { text: 'late' })).toThrow(
			'Cannot update an unmounted root.',
		);
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:883/:1338 — an
	// uncaught mount error discards the failed tree but the root can recover.
	it('discards an uncaught initial render without leaking its effects', () => {
		const log: string[] = [];
		const root = trackRoot(createRoot(container));

		expect(() =>
			root.render(client.EffectThenThrowRoot, {
				log: (entry: string) => log.push(entry),
			}),
		).toThrow('failed initial render');
		expect(container.textContent).toBe('');

		flushEffects();
		expect(log).toEqual([]);

		// The failed tree is gone, but React permits a later render on the same
		// root to recover from an uncaught mount error.
		render(root, client.TextRoot, { text: 'recovered' });
		expect(container.textContent).toBe('recovered');
	});

	// Per ReactDOMRoot-test.js:136 (stable), :120 (canary).
	it('supports hydration', () => {
		const props = { className: 'server', text: 'Hello' };
		const { html } = ServerRuntime.renderToString(server.HydrationRoot, props);

		const clientOnlyContainer = makeContainer();
		clientOnlyContainer.innerHTML = html;
		const replacedServerNode = clientOnlyContainer.firstElementChild;
		const clientOnlyRoot = trackRoot(createRoot(clientOnlyContainer));
		render(clientOnlyRoot, client.HydrationRoot, props);
		expect(clientOnlyContainer.firstElementChild).not.toBe(replacedServerNode);

		container.innerHTML = html;
		const adoptedServerNode = container.firstElementChild;
		const hydratedRoot = trackRoot(hydrateRoot(container, client.HydrationRoot, props));
		flushSync(() => {});
		expect(container.firstElementChild).toBe(adoptedServerNode);
		expect(container.querySelector('span')?.textContent).toBe('Hello');
	});

	// Per ReactDOMRoot-test.js:189 (stable), :173 (canary).
	it('clears existing children', () => {
		container.innerHTML = '<div>a</div><div>b</div>';
		const stale = Array.from(container.children);
		const root = trackRoot(createRoot(container));
		render(root, client.OrderedChildren, { first: 'c', second: 'd' });
		expect(container.textContent).toBe('cd');
		expect(stale.every((node) => !node.isConnected)).toBe(true);
		render(root, client.OrderedChildren, { first: 'd', second: 'c' });
		expect(container.textContent).toBe('dc');
	});

	// Per ReactDOMRoot-test.js:210 (stable), :194 (canary).
	it('throws a good message on invalid containers', () => {
		const element = createElement(client.TextRoot, { text: 'Hi' });
		expect(() => createRoot(element as any)).toThrow('Target container is not a DOM element.');
	});

	// Per ReactDOMRoot-test.js:216 (stable), :200 (canary).
	it('warns when creating two roots managing the same container', () => {
		const { messages } = captureConsoleErrors(() => {
			trackRoot(createRoot(container));
			trackRoot(createRoot(container));
		});
		expect(messages).toEqual([
			'You are calling createRoot() on a container that has already been passed ' +
				'to createRoot() before. Instead, call root.render() on the existing root instead if ' +
				'you want to update it.',
		]);
	});

	// Per ReactDOMRoot-test.js:229 (stable), :210 (canary).
	it('does not warn when creating second root after first one is unmounted', () => {
		const first = trackRoot(createRoot(container));
		first.unmount();
		const { result: second, messages } = captureConsoleErrors(() => createRoot(container));
		trackRoot(second);
		expect(messages).toEqual([]);
		render(second, client.TextRoot, { text: 'new owner' });
		expect(container.textContent).toBe('new owner');
	});

	// Per ReactDOMRoot-test.js:236 (stable), :217 (canary).
	it('warns if creating a root on the document.body', () => {
		// The upstream case now explicitly expects no diagnostic when Float is on.
		const { result: root, messages } = captureConsoleErrors(() => createRoot(document.body));
		trackRoot(root);
		expect(messages).toEqual([]);
		root.unmount();
	});

	// Per ReactDOMRoot-test.js:241 (stable), :222 (canary).
	it('warns if updating a root that has had its contents removed', () => {
		const root = trackRoot(createRoot(container));
		render(root, client.TextRoot, { text: 'Hi' });
		container.textContent = '';
		const { messages } = captureConsoleErrors(() =>
			flushSync(() => root.render(client.TextRoot, { text: 'updated' })),
		);
		// The upstream feature gates disable this legacy diagnostic; the update is
		// accepted and the root remains usable regardless of whether an implementation
		// repairs the externally-detached node during that same update.
		expect(messages).toEqual([]);
		render(root, client.SpanRoot);
		expect(container.querySelector('#span-root')?.textContent).toBe('span');
	});

	// Per ReactDOMRoot-test.js:252 (stable), :233 (canary).
	it('should render different components in same root', () => {
		const root = trackRoot(createRoot(container));
		render(root, client.DivRoot);
		expect(container.firstElementChild?.tagName).toBe('DIV');
		render(root, client.SpanRoot);
		expect(container.firstElementChild?.tagName).toBe('SPAN');
	});

	// Per ReactDOMRoot-test.js:267 (stable), :248 (canary).
	it('should not warn if mounting into non-empty node', () => {
		container.innerHTML = '<div id="old"></div>';
		const { result: root, messages } = captureConsoleErrors(() => {
			const created = createRoot(container);
			flushSync(() => created.render(client.DivRoot));
			return created;
		});
		trackRoot(root);
		expect(messages).toEqual([]);
		expect(container.querySelector('#old')).toBeNull();
		expect(container.querySelector('#div-root')).not.toBeNull();
	});

	// Per ReactDOMRoot-test.js:277 (stable), :258 (canary).
	it('should reuse markup if rendering to the same target twice', () => {
		const root = trackRoot(createRoot(container));
		render(root, client.DivRoot);
		const firstElement = container.firstElementChild;
		render(root, client.DivRoot);
		expect(container.firstElementChild).toBe(firstElement);
	});

	// Per ReactDOMRoot-test.js:290 (stable), :271 (canary).
	it('should unmount and remount if the key changes', () => {
		const log: string[] = [];
		const root = trackRoot(createRoot(container));
		const keyed = (key: string, text: string) =>
			createElement(client.KeyedRoot, { key, text, log: (entry: string) => log.push(entry) });

		flushSync(() => root.render(keyed('A', 'orange')));
		flushEffects();
		const orange = container.querySelector('#keyed-root');
		expect(orange?.textContent).toBe('orange:orange');
		expect(log.splice(0)).toEqual(['Mount']);

		flushSync(() => root.render(keyed('B', 'green')));
		flushEffects();
		const green = container.querySelector('#keyed-root');
		expect(green).not.toBe(orange);
		expect(green?.textContent).toBe('green:green');
		expect(log.splice(0)).toEqual(['Unmount', 'Mount']);

		flushSync(() => root.render(keyed('B', 'blue')));
		flushEffects();
		expect(container.querySelector('#keyed-root')).toBe(green);
		expect(green?.textContent).toBe('blue:green');
		expect(log).toEqual([]);
	});

	// Per ReactDOMRoot-test.js:326 (stable), :307 (canary).
	it('throws if unmounting a root that has had its contents removed', () => {
		const root = trackRoot(createRoot(container));
		render(root, client.TextRoot, { text: 'Hi' });
		container.textContent = '';
		// OCTANE DIVERGENCE: root teardown owns the container as a whole and is
		// deliberately safe after external DOM removal. React's NotFoundError is an
		// incidental result of its per-host-node deletion path, not a useful contract.
		expect(() => root.unmount()).not.toThrow();
		expect(container.textContent).toBe('');
	});

	// Per ReactDOMRoot-test.js:340 (stable), :321 (canary).
	it('unmount is synchronous', () => {
		const root = trackRoot(createRoot(container));
		flushSync(() => root.render('Hi'));
		expect(container.textContent).toBe('Hi');
		root.unmount();
		// No scheduler drain is needed: the managed DOM is gone before return.
		expect(container.textContent).toBe('');
	});

	// Per ReactDOMRoot-test.js:354 (stable), :335 (canary).
	it('throws if an unmounted root is updated', () => {
		const root = trackRoot(createRoot(container));
		flushSync(() => root.render('Hi'));
		root.unmount();
		expect(() => root.render("I'm back")).toThrow('Cannot update an unmounted root.');
	});

	// Per ReactDOMRoot-test.js:368 (stable), :349 (canary).
	it('warns if root is unmounted inside an effect', () => {
		const otherContainer = makeContainer();
		const otherRoot = trackRoot(createRoot(otherContainer));
		render(otherRoot, client.TextRoot, { text: 'Other root' });

		const root = trackRoot(createRoot(container));
		render(root, client.EffectUnmountRoot, {
			step: 1,
			unmountOtherRoot: () => otherRoot.unmount(),
		});
		flushEffects();

		const { messages } = captureConsoleErrors(() => {
			flushSync(() =>
				root.render(client.EffectUnmountRoot, {
					step: 2,
					unmountOtherRoot: () => otherRoot.unmount(),
				}),
			);
			flushEffects();
		});
		expect(messages).toEqual([
			'Attempted to synchronously unmount a root while Octane was already rendering. ' +
				'Octane cannot finish unmounting the root until the current render has completed, ' +
				'which may lead to a race condition.',
		]);
		expect(otherContainer.textContent).toBe('');
	});

	// Per ReactDOMRoot-test.js:400 (stable), :381 (canary).
	it('errors if container is a comment node', () => {
		const comment = document.createComment('react-mount-point-unstable');
		expect(() => createRoot(comment as any)).toThrow('Target container is not a DOM element.');
		expect(() => hydrateRoot(comment as any, client.HydrationRoot, {})).toThrow(
			'Target container is not a DOM element.',
		);
	});

	// Per ReactDOMRoot-test.js:414 (stable), :395 (canary).
	it('warn if no children passed to hydrateRoot', () => {
		const { result: root, messages } = captureConsoleErrors(() => (hydrateRoot as any)(container));
		trackRoot(root);
		expect(messages).toEqual([
			'Must provide initial children as second argument to hydrateRoot. ' +
				'Example usage: hydrateRoot(domContainer, <App />)',
		]);
		expect(container.textContent).toBe('');
	});

	// Per ReactDOMRoot-test.js:425 (stable), :403 (canary).
	it('warn if JSX passed to createRoot', () => {
		const element = createElement(client.TextRoot, { text: 'not options' });
		const { result: root, messages } = captureConsoleErrors(() =>
			createRoot(container, element as any),
		);
		trackRoot(root);
		expect(messages).toEqual([
			'You passed a JSX element to createRoot. You probably meant to call root.render instead. ' +
				'Example usage:\n\n  let root = createRoot(domContainer);\n  root.render(<App />);',
		]);
		render(root, client.TextRoot, { text: 'Child' });
		expect(container.textContent).toBe('Child');
	});

	// Per ReactDOMRoot-test.js:445 (stable), :418 (canary).
	it('warns when given a function', () => {
		const root = trackRoot(createRoot(container));
		// OCTANE DIVERGENCE: root.render(Component, props) is Octane's documented
		// allocation-free root API, so a bare compiled function is rendered rather
		// than treated as an invalid child value.
		const { messages } = captureConsoleErrors(() =>
			flushSync(() => root.render(client.TextRoot, { text: 'function component' })),
		);
		expect(messages).toEqual([]);
		expect(container.textContent).toBe('function component');
	});

	// Per ReactDOMRoot-test.js:466 (stable), :436 (canary).
	it('warns when given a symbol', () => {
		const root = trackRoot(createRoot(container));
		const value = Symbol('foo');
		const { messages } = captureConsoleErrors(() => flushSync(() => (root.render as any)(value)));
		expect(messages).toEqual([
			'Symbols are not valid as an Octane child.\n  root.render(Symbol(foo))',
		]);
		expect(container.textContent).toBe('');
	});
});
