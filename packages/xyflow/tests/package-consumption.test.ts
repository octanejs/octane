// @vitest-environment node

import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { octane } from 'octane/compiler/vite';
import { build } from 'vite';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

type ConsumerModule = typeof import('./_fixtures/public-hooks-consumer.tsrx');

async function buildConsumer(entry: string): Promise<string> {
	const result = await build({
		configFile: false,
		root: resolve(import.meta.dirname, '../../..'),
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			minify: false,
			target: 'esnext',
			lib: { entry, formats: ['iife'], name: 'FlowConsumer' },
		},
	});
	const chunks = (Array.isArray(result) ? result : [result]).flatMap((bundle) => {
		if (!('output' in bundle)) throw new Error('Expected a library bundle.');
		return bundle.output.filter((output) => output.type === 'chunk');
	});
	expect(chunks).toHaveLength(1);
	expect(chunks[0].imports).toEqual([]);
	expect(chunks[0].dynamicImports).toEqual([]);
	return chunks[0].code;
}

// @parity-case adapted:package-consumption
it('preserves flow components and change helpers in a production consumer bundle', async () => {
	const code = await buildConsumer(resolve(import.meta.dirname, '../src/index.ts'));
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		runScripts: 'outside-only',
		url: 'https://octane.test/',
	});
	try {
		dom.window.eval(code);
		const flow = (dom.window as unknown as { FlowConsumer: Record<string, any> }).FlowConsumer;
		for (const name of ['ReactFlow', 'ReactFlowProvider', 'Handle', 'useReactFlow']) {
			expect(typeof flow[name]).toBe('function');
		}
		const nodes = [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }];
		expect(flow.applyNodeChanges([{ id: 'a', type: 'select', selected: true }], nodes)).toEqual([
			{ ...nodes[0], selected: true },
		]);
		expect(flow.isNode(nodes[0])).toBe(true);
		const edges = flow.addEdge({ source: 'a', target: 'b' }, []);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ source: 'a', target: 'b' });
		expect(flow.isEdge(edges[0])).toBe(true);
	} finally {
		dom.window.close();
	}
}, 60_000);

describe('production flow consumers', () => {
	let code: string;
	let dom: JSDOM;
	let consumer: ConsumerModule;
	let root: ReturnType<ConsumerModule['createRoot']> | undefined;
	let errors: unknown[];

	beforeAll(async () => {
		code = await buildConsumer(
			resolve(import.meta.dirname, '_fixtures/public-hooks-consumer.tsrx'),
		);
	}, 60_000);

	afterEach(() => {
		root?.unmount();
		root = undefined;
		dom?.window.close();
	});

	async function openConsumer() {
		dom = new JSDOM('<!doctype html><html><body></body></html>', {
			runScripts: 'outside-only',
			pretendToBeVisual: true,
			url: 'https://octane.test/',
		});
		errors = [];
		dom.window.addEventListener('error', (event) => {
			errors.push(event.error);
			event.preventDefault();
		});
		dom.window.eval(code);
		consumer = (dom.window as unknown as { FlowConsumer: ConsumerModule }).FlowConsumer;
		root = consumer.createRoot(dom.window.document.body, {
			onUncaughtError(error) {
				errors.push(error);
			},
		});
	}

	async function settle() {
		consumer.flushSync(() => {});
		// A visible consumer starts passive subscriptions after its frame has painted.
		await new Promise<void>((done) => {
			dom.window.requestAnimationFrame(() => dom.window.setTimeout(done, 0));
		});
		consumer.flushSync(() => {});
	}

	function text(selector: string) {
		return dom.window.document.querySelector(selector)?.textContent;
	}

	function click(selector: string) {
		const button = dom.window.document.querySelector(selector);
		expect(button).not.toBeNull();
		consumer.flushSync(() => {
			button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		});
	}

	function key(target: EventTarget, type: 'keydown' | 'keyup', key: string, ctrlKey = false) {
		const event = new dom.window.KeyboardEvent(type, {
			key,
			code: key === 'Control' ? 'ControlLeft' : `Key${key.toUpperCase()}`,
			ctrlKey,
			bubbles: true,
			cancelable: true,
		});
		consumer.flushSync(() => target.dispatchEvent(event));
		return event;
	}

	// @parity-case adapted:queue-consumer
	it('applies successive node and edge mutations through the public instance', async () => {
		await openConsumer();
		root!.render(consumer.QueueConsumer);
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="node-snapshot"]')).toBe('a:A,b:B');
		expect(text('[data-testid="edge-snapshot"]')).toBe('a-b:AB');

		click('[data-testid="update-nodes"]');
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="node-snapshot"]')).toBe('a:updated A,c:C');
		expect(text('[data-testid="edge-snapshot"]')).toBe('a-b:AB');

		click('[data-testid="update-edges"]');
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="node-snapshot"]')).toBe('a:updated A,c:C');
		expect(text('[data-testid="edge-snapshot"]')).toBe('c-a:updated CA');
	});

	// @parity-case adapted:key-press-options
	it('keeps key subscriptions independent across supported optional argument shapes', async () => {
		await openConsumer();
		const target = dom.window.document.createElement('div');
		root!.render(consumer.KeyPressConsumer, { target });
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="key-snapshot"]')).toBe('00000000');

		for (const [pressed, snapshot] of [
			['a', '01000000'],
			['b', '00100000'],
			['c', '00010000'],
			['d', '00001000'],
		]) {
			expect(key(dom.window.document, 'keydown', pressed).defaultPrevented).toBe(true);
			expect(text('[data-testid="key-snapshot"]')).toBe(snapshot);
			key(dom.window.document, 'keyup', pressed);
			expect(text('[data-testid="key-snapshot"]')).toBe('00000000');
		}

		key(dom.window.document, 'keydown', 'e');
		expect(text('[data-testid="key-snapshot"]')).toBe('00000000');
		key(dom.window.document, 'keyup', 'e');
		expect(key(target, 'keydown', 'e').defaultPrevented).toBe(false);
		expect(text('[data-testid="key-snapshot"]')).toBe('00000100');
		key(target, 'keyup', 'e');
		expect(text('[data-testid="key-snapshot"]')).toBe('00000000');

		const input = dom.window.document.querySelector('[data-testid="key-input"]')!;
		key(input, 'keydown', 'Control', true);
		key(input, 'keydown', 'j', true);
		expect(text('[data-testid="key-snapshot"]')).toBe('00000010');
		key(input, 'keyup', 'j', true);
		key(input, 'keyup', 'Control');
		key(input, 'keydown', 'Control', true);
		key(input, 'keydown', 'k', true);
		expect(text('[data-testid="key-snapshot"]')).toBe('00000000');
		key(input, 'keyup', 'k', true);
		key(input, 'keyup', 'Control');
		expect(errors).toEqual([]);
	});

	// @parity-case adapted:store-equality-options
	it('subscribes to store updates with omitted, default and explicit equality', async () => {
		await openConsumer();
		root!.render(consumer.StoreConsumer);
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="draggable-snapshot"]')).toBe('111');

		click('[data-testid="toggle-draggable"]');
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="draggable-snapshot"]')).toBe('000');

		click('[data-testid="toggle-draggable"]');
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="draggable-snapshot"]')).toBe('111');
	});

	// @parity-case adapted:connection-default-options
	it('supports connection selectors and node initialization with default options', async () => {
		await openConsumer();
		root!.render(consumer.ConnectionConsumer);
		await settle();
		expect(errors).toEqual([]);
		expect(text('[data-testid="connection-snapshot"]')).toBe('0000');
	});
});
