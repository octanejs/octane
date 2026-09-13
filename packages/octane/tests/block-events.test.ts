import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { compile } from 'octane/compiler';
import { describe, expect, it, vi } from 'vitest';
import { createElement, hydrateRoot } from '../src/index.js';
import { renderToString } from 'octane/server';
import { act, mount } from './_helpers.js';
import { evaluateCompiledFixtureCode, loadCompiledFixtureSource } from './_server-fixture.js';

const source = readFileSync('packages/octane/tests/_fixtures/block-events.tsrx', 'utf8');
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
const client = loadCompiledFixtureSource(source, {
	id: 'block-events.tsrx',
	mode: 'client',
	compileOptions: { dev, hmr: false },
});
const server = loadCompiledFixtureSource(source, {
	id: 'block-events.tsrx',
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const click = (node: Element) => {
	const event = new MouseEvent('click', { bubbles: true, cancelable: true });
	node.dispatchEvent(event);
	return event;
};

describe('native events with statement bodies', () => {
	it('keeps event identity, cancellation, current target, and updated captures', () => {
		const log = vi.fn();
		const r = mount(client.BlockEvent, { log, value: 'first' });
		const button = r.find('button');
		const first = click(button);
		expect(log).toHaveBeenLastCalledWith('first', first, button);
		expect(first.defaultPrevented).toBe(true);
		r.update(client.BlockEvent, { log, value: 'next' });
		const second = click(button);
		expect(log).toHaveBeenLastCalledWith('next', second, button);
		r.unmount();
		click(button);
		expect(log).toHaveBeenCalledTimes(2);
	});

	it.each([
		['onDoubleClick', 'onDblClick', 'dblclick'],
		['onFocus', 'onFocusIn', 'focusin'],
		['onBlur', 'onFocusOut', 'focusout'],
		['onDoubleClickCapture', 'onDblClickCapture', 'dblclick'],
	])('keeps the final native alias %s / %s after updates', (firstName, lastName, type) => {
		const { App } = loadCompiledFixtureSource(
			`export function App(props) @{
			<button ${firstName}={props.first} ${lastName}={(event) => {
				event.preventDefault(); props.log(props.value);
			}}>alias</button>
		}`,
			{ id: 'block-event-alias.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
		);
		const log = vi.fn();
		const first = vi.fn();
		const r = mount(App, { log, first, value: 'first' });
		const button = r.find('button');
		const fire = () => button.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
		expect(fire()).toBe(false);
		r.update(App, { log, first, value: 'next' });
		expect(fire()).toBe(false);
		expect(log.mock.calls).toEqual([['first'], ['next']]);
		expect(first).not.toHaveBeenCalled();
		r.unmount();
	});

	it('defers mutable member reads and preserves method receivers', () => {
		const log = vi.fn();
		const reads: string[] = [];
		const box = { current: 'mount' };
		const receiver = {
			prefix: 'receiver',
			record(value: string) {
				reads.push(`${this.prefix}:${value}`);
			},
		};
		const props = {
			log,
			box,
			receiver,
			get label() {
				reads.push('get');
				return box.current;
			},
		};
		const r = mount(client.DeferredReads, props);
		expect(reads).toEqual([]);
		box.current = 'click';
		click(r.find('button'));
		expect(log).toHaveBeenCalledWith('click');
		expect(reads).toEqual(['get', 'receiver:click']);
		r.unmount();
	});

	it('keeps mutable captures live between events and after parameter reassignment', () => {
		const log = vi.fn();
		const r = mount(client.MutableCapture, { log });
		click(r.find('button'));
		click(r.find('button'));
		expect(log.mock.calls).toEqual([[1], [2]]);
		let replace!: (value: string) => void;
		r.update(client.ReassignedParameter, {
			log,
			value: 'render',
			expose: (next: typeof replace) => {
				replace = next;
			},
		});
		replace('event');
		click(r.find('button'));
		expect(log.mock.calls.slice(2)).toEqual([['event'], ['end']]);
		r.unmount();
	});

	it('keeps component-local classes distinct from module declarations', () => {
		const log = vi.fn();
		const r = mount(client.LocalClass, { log });
		click(r.find('button'));
		expect(log.mock.calls).toEqual([['inner'], ['end']]);
		r.unmount();
	});

	it('keeps runtime TypeScript declarations in their component scope', () => {
		const { code } = compile(
			`export function App(props) @{
			enum Local { Label = 'inner' }
			<button onClick={() => { props.log(Local.Label); props.log('end'); }}>enum</button>
		}`,
			'block-event-enum.tsrx',
			{ dev, hmr: false },
		);
		// Runtime TypeScript declarations are lowered by the consuming toolchain.
		const { outputText } = ts.transpileModule(code, {
			compilerOptions: {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext,
			},
		});
		const { App } = evaluateCompiledFixtureCode(
			outputText,
			'block-event-enum.tsrx',
			'client',
			undefined,
		);
		const log = vi.fn();
		const r = mount(App, { log });
		click(r.find('button'));
		expect(log.mock.calls).toEqual([['inner'], ['end']]);
		r.unmount();
	});

	it('preserves function-scoped shadowing and lexical arguments', () => {
		const log = vi.fn();
		const r = mount(client.FunctionScoped, { log, value: 'outer', enabled: false });
		click(r.find('button'));
		expect(log.mock.calls).toEqual([[undefined], ['end']]);
		r.update(client.FunctionScoped, { log, value: 'outer', enabled: true });
		click(r.find('button'));
		expect(log.mock.calls.slice(2)).toEqual([['inner'], ['end']]);
		r.update(client.LexicalArguments, { log, value: 'arguments' });
		click(r.find('button'));
		expect(log.mock.calls.slice(4)).toEqual([['arguments'], ['end']]);
		r.unmount();
	});

	it('restores committed captures when a later root sibling suspends', () => {
		const pending = new Promise(() => {});
		const log = vi.fn();
		const Reader = ({ suspend }: { suspend: boolean }) => {
			if (suspend) throw pending;
			return createElement('span', null, 'ready');
		};
		const Scene = ({ value, suspend }: { value: string; suspend: boolean }) =>
			createElement(
				'div',
				null,
				createElement(client.BlockEvent, { log, value }),
				createElement(Reader, { suspend }),
			);
		const r = mount(Scene, { value: 'committed', suspend: false });
		const button = r.find('button');
		r.update(Scene, { value: 'pending', suspend: true });
		expect(r.find('button')).toBe(button);
		click(button);
		expect(log.mock.lastCall?.[0]).toBe('committed');
		r.update(Scene, { value: 'accepted', suspend: false });
		click(button);
		expect(log.mock.lastCall?.[0]).toBe('accepted');
		r.unmount();
	});

	it('updates state and follows replaced keyed rows without remounting', () => {
		const r = mount(client.Count);
		act(() => click(r.find('button')));
		expect(r.find('button').textContent).toBe('1');
		act(() => click(r.find('button')));
		expect(r.find('button').textContent).toBe('2');
		const log = vi.fn();
		r.update(client.Rows, { log, rows: [{ id: 1, label: 'one' }] });
		const button = r.find('button');
		r.update(client.Rows, { log, rows: [{ id: 1, label: 'new' }] });
		expect(r.find('button')).toBe(button);
		click(button);
		expect(log).toHaveBeenCalledWith('new');
		r.unmount();
	});

	it('preserves queued captures across updates and nested native dispatch', () => {
		const calls: string[] = [];
		let r: ReturnType<typeof mount>;
		let nested = false;
		const log = (label: string, target: string) => calls.push(`${label}:${target}`);
		const change = () => {
			if (nested) return;
			nested = true;
			r.update(client.Snapshot, { label: 'new', log, change });
			click(r.find('button'));
		};
		r = mount(client.Snapshot, { label: 'old', log, change });
		click(r.find('button'));
		expect(calls).toEqual(['new:div', 'old:div']);
		r.unmount();
	});

	it('reports thrown handlers and continues native bubbling', () => {
		const error = new Error('event body');
		const errors: unknown[] = [];
		const observe = (event: ErrorEvent) => {
			errors.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', observe);
		const log = vi.fn();
		const parent = vi.fn();
		const r = mount(client.Failing, { error, log, parent, label: 'before' });
		try {
			click(r.find('button'));
			expect(log).toHaveBeenCalledWith('before');
			expect(errors).toEqual([error]);
			expect(parent).toHaveBeenCalledOnce();
		} finally {
			r.unmount();
			window.removeEventListener('error', observe);
		}
	});

	it('adopts server nodes and installs live native event captures', () => {
		const log = vi.fn();
		const props = { log, value: 'server' };
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.BlockEvent, props).html;
		document.body.appendChild(container);
		const button = container.querySelector('button')!;
		const root = hydrateRoot(container, client.BlockEvent, props);
		try {
			expect(container.querySelector('button')).toBe(button);
			const event = click(button);
			expect(log).toHaveBeenLastCalledWith('server', event, button);
			expect(event.defaultPrevented).toBe(true);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
