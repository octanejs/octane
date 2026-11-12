/**
 * `octane/data/react`: the store's guarantees, observed from a real React 19
 * tree. Two components that read the same store show the same value, the same
 * pending edit and the same rollback.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { createDataStore, type DataStore } from '../../src/data/index.js';
import { DataProvider, useForm, useRead, useReadState, useWrite } from '../../src/data/react.js';
import { createServer, setDone, todos } from '../_data-todos.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const act: <T>(scope: () => T | Promise<T>) => Promise<T> = (React as any).act;
const h = React.createElement;

function Titles() {
	const list = useRead(todos, undefined);
	return h('ul', null, ...list.map((todo) => h('li', { key: todo.id }, todo.title)));
}

function DoneCount() {
	const { value } = useReadState(todos, undefined);
	return h('output', null, value ? String(value.filter((todo) => todo.done).length) : '…');
}

let submit: (input: { id: string; done: boolean }) => Promise<unknown>;
function Toggle() {
	submit = useWrite(setDone);
	return null;
}

class Boundary extends React.Component<{ children?: React.ReactNode }, { message: string }> {
	override state = { message: '' };
	static getDerivedStateFromError(error: Error) {
		return { message: error.message };
	}
	override render() {
		return this.state.message ? h('p', null, this.state.message) : this.props.children;
	}
}

let root: Root | undefined;
let container: HTMLElement;

async function mount(store: DataStore) {
	container = document.createElement('div');
	root = createRoot(container);
	await act(() =>
		root!.render(
			h(
				DataProvider,
				{ store },
				h(
					Boundary,
					null,
					h(React.Suspense, { fallback: h('p', null, 'Loading') }, h(Titles), h(Toggle)),
					h(DoneCount),
				),
			),
		),
	);
}

afterEach(() => {
	root?.unmount();
	root = undefined;
});

describe('octane/data/react', () => {
	it('clears a mounted form after its store retires', async () => {
		const contract = { ...setDone, form: { id: 'text', done: 'checkbox' } as const };
		const store = createDataStore({
			transport: createServer().transport,
			form: {
				token: 'token',
				nonce: 'page',
				outcome: {
					write: contract.name,
					key: '',
					pending: false,
					values: { id: 'previous account' },
					issues: {},
					error: 'invalid',
				},
			},
		});
		function Fields() {
			const form = useForm(contract);
			return h('form', form.attrs, h('output', null, form.values['id'] ?? 'empty'), form.hidden());
		}
		container = document.createElement('div');
		root = createRoot(container);
		await act(() => root!.render(h(DataProvider, { store }, h(Boundary, null, h(Fields)))));
		expect(container.querySelector('output')?.textContent).toBe('previous account');
		await act(() => store.retire());
		expect(container.querySelector('output')?.textContent).toBe('empty');
		expect(container.querySelectorAll('input')).toHaveLength(0);
		const submit = new Event('submit', { bubbles: true, cancelable: true });
		await act(async () => {
			container.querySelector('form')!.dispatchEvent(submit);
		});
		expect(submit.defaultPrevented).toBe(true);
	});

	it('suspends until the first value and shares one load between components', async () => {
		const server = createServer();
		await mount(createDataStore({ transport: server.transport }));
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

		expect(container.querySelector('li')!.textContent).toBe('Tides');
		expect(container.querySelector('output')!.textContent).toBe('0');
		expect(server.log).toEqual(['list']);
	});

	it('shows an edit in every component at once and rolls it back when refused', async () => {
		const server = createServer();
		await mount(createDataStore({ transport: server.transport }));
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

		// The edit is on screen before any reply: flushSync renders inside the submitting task.
		let saved!: Promise<unknown>;
		await act(async () => {
			flushSync(() => {
				saved = submit({ id: 'a', done: true });
			});
			expect(container.querySelector('output')!.textContent).toBe('1');
			await saved;
		});
		expect(container.querySelector('output')!.textContent).toBe('1');

		// The row is gone on the server, so the next edit is refused.
		server.rows.length = 0;
		let refused!: Promise<unknown>;
		await act(async () => {
			flushSync(() => {
				refused = submit({ id: 'a', done: false }).catch((error) => error);
			});
			expect(container.querySelector('output')!.textContent).toBe('0');
			await refused;
		});
		expect(await refused).toMatchObject({ code: 'missing' });
		expect(container.querySelector('output')!.textContent).toBe('1');
		expect(container.querySelector('li')!.textContent).toBe('Tides');
	});

	it('sends a failed first load to the error boundary', async () => {
		await mount(createDataStore({ transport: () => Promise.reject(new Error('offline')) }));
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

		expect(container.textContent).toBe('offline');
	});
});
