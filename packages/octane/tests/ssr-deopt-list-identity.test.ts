import { describe, expect, it, vi } from 'vitest';
import {
	createElement,
	Fragment,
	positionalChildren,
	renderToPipeableStream,
	use,
} from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource } from './_server-fixture';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	resetStreamRuntimeGlobals,
} from './_server-stream';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

interface ListScenario {
	phase: 'keyed-first' | 'nested-first' | 'mixed';
	plain: Promise<string>;
	keyed: Promise<string>;
	nested: Promise<string>;
}

function Row(props: { kind: string; value: Promise<string> }) {
	return createElement('li', { 'data-kind': props.kind }, use(props.value));
}

function Page(props: { scenario: ListScenario }) {
	const { scenario } = props;
	const plain = createElement(Row, { kind: 'plain', value: scenario.plain });
	const keyed = createElement(Row, { key: '0', kind: 'keyed', value: scenario.keyed });
	const nested = createElement(
		Fragment,
		{ key: 'branch' },
		createElement(Row, { key: '0', kind: 'nested', value: scenario.nested }),
	);
	return createElement(
		'ul',
		null,
		scenario.phase === 'keyed-first' ? [keyed, nested] : [plain, keyed, nested],
	);
}

function NestedPage(props: { scenario: ListScenario }) {
	const { scenario } = props;
	const plain = createElement(Row, { kind: 'plain', value: scenario.plain });
	const keyed = createElement(Row, { key: '0', kind: 'keyed', value: scenario.keyed });
	const nested = createElement(
		Fragment,
		{ key: 'branch' },
		createElement(Row, { kind: 'nested', value: scenario.nested }),
	);
	return createElement(
		'ul',
		null,
		scenario.phase === 'nested-first' ? [nested, keyed] : [plain, keyed, nested],
	);
}

function rows(html: string): string[] {
	const host = document.createElement('div');
	host.innerHTML = html;
	return Array.from(
		host.querySelectorAll('li'),
		(row) => `${row.getAttribute('data-kind')}:${row.textContent}`,
	);
}

const { StreamingRow } = loadCompiledFixtureSource(
	`import { use } from 'octane';
	 export function StreamingRow(props) @{
		@try {
			const value = use(props.value);
			<li data-kind={props.kind}>{value as string}</li>
		} @pending {
			<li data-kind={props.kind}>waiting</li>
		}
	 }`,
	{ id: 'ssr-deopt-list-streaming-row.tsrx', mode: 'server' },
);

function StreamingPage(props: { scenario: ListScenario }) {
	const { scenario } = props;
	return createElement('ul', null, [
		createElement(StreamingRow, { kind: 'plain', value: scenario.plain }),
		createElement(StreamingRow, { key: '0', kind: 'keyed', value: scenario.keyed }),
		createElement(
			Fragment,
			{ key: 'branch' },
			createElement(StreamingRow, { key: '0', kind: 'nested', value: scenario.nested }),
		),
	]);
}

interface NestedSiblingScenario {
	reverse: boolean;
	values: Map<string, Promise<string>>;
}

function nestedSiblingOrder(reverse: boolean): string[] {
	return (reverse ? ['second', 'first'] : ['first', 'second']).flatMap((group) =>
		['outer-0', 'keyed', 'outer-1', 'inner-0', 'inner-1'].map((row) => `${group}-${row}`),
	);
}

function nestedSiblingChildren(scenario: NestedSiblingScenario, component: typeof Row) {
	return (scenario.reverse ? ['second', 'first'] : ['first', 'second']).map((group) => {
		const row = (name: string, key?: string) => {
			const kind = `${group}-${name}`;
			return createElement(component, { kind, value: scenario.values.get(kind)!, key });
		};
		return createElement(
			Fragment,
			{ key: `quote"\\slash\n\u0000\ud800:${group}` },
			row('outer-0'),
			row('keyed', '0'),
			row('outer-1'),
			positionalChildren([row('inner-0'), row('inner-1')]),
		);
	});
}

function NestedSiblingsPage(props: { scenario: NestedSiblingScenario }) {
	return createElement('ul', null, nestedSiblingChildren(props.scenario, Row));
}

function NestedStreamingSiblingsPage(props: { scenario: NestedSiblingScenario }) {
	return createElement('ul', null, nestedSiblingChildren(props.scenario, StreamingRow));
}

function nestedSiblingRequest(reverse: boolean) {
	const pending = new Map(nestedSiblingOrder(false).map((name) => [name, deferred<string>()]));
	const scenario: NestedSiblingScenario = {
		reverse,
		values: new Map([...pending].map(([name, value]) => [name, value.promise])),
	};
	return { pending, scenario };
}

describe('server descriptor lists across async retries', () => {
	it('keeps nested sibling results with their keyed wrappers across interleaved retries', async () => {
		const first = nestedSiblingRequest(false);
		const second = nestedSiblingRequest(true);
		const firstResult = prerender(NestedSiblingsPage, { scenario: first.scenario });
		const secondResult = prerender(NestedSiblingsPage, { scenario: second.scenario });

		// Both requests suspend before their wrapper order changes. Each row must
		// receive its own settled value when the complete page renders again.
		first.scenario.reverse = true;
		second.scenario.reverse = false;
		for (const name of nestedSiblingOrder(true)) {
			second.pending.get(name)!.resolve(`B-${name}`);
			first.pending.get(name)!.resolve(`A-${name}`);
		}

		const [firstHtml, secondHtml] = await Promise.all([firstResult, secondResult]);
		expect(rows(firstHtml.html)).toEqual(
			nestedSiblingOrder(true).map((name) => `${name}:A-${name}`),
		);
		expect(rows(secondHtml.html)).toEqual(
			nestedSiblingOrder(false).map((name) => `${name}:B-${name}`),
		);
	});

	it('reveals nested implicit siblings independently when their stream resolves out of order', async () => {
		const request = nestedSiblingRequest(false);
		const output = createPipeableCollector();
		const errors: unknown[] = [];
		const stream = renderToPipeableStream(
			NestedStreamingSiblingsPage,
			{ scenario: request.scenario },
			{ onError: (error) => errors.push(error) },
		);
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			stream.pipe(output.destination);
			await vi.waitFor(() => {
				expect(rows(output.chunks.join(''))).toEqual(
					nestedSiblingOrder(false).map((name) => `${name}:waiting`),
				);
			});

			for (const name of ['second-inner-1', 'first-outer-1']) {
				request.pending.get(name)!.resolve(`VALUE-${name}`);
				await vi.waitFor(() => expect(output.chunks.join('')).toContain(`VALUE-${name}`));
			}
			for (const [name, value] of request.pending) value.resolve(`VALUE-${name}`);
			container.innerHTML = await output.ended;
			activateStreamedMarkup(container);
			expect(rows(container.innerHTML)).toEqual(
				nestedSiblingOrder(false).map((name) => `${name}:VALUE-${name}`),
			);
			expect(errors).toEqual([]);
		} finally {
			stream.abort();
			container.remove();
			resetStreamRuntimeGlobals();
		}
	});

	it("does not reuse a nested unkeyed child's result for a new top-level position", async () => {
		const plain = deferred<string>();
		const keyed = deferred<string>();
		const nested = deferred<string>();
		const scenario: ListScenario = {
			phase: 'nested-first',
			plain: plain.promise,
			keyed: keyed.promise,
			nested: nested.promise,
		};

		// The nested child starts at its own wrapper position. A later top-level
		// child at index zero must read its own promise, even on an SSR retry.
		const pending = prerender(NestedPage, { scenario });
		scenario.phase = 'mixed';
		nested.resolve('NESTED');
		plain.resolve('PLAIN');
		keyed.resolve('KEYED');

		expect(rows((await pending).html)).toEqual(['plain:PLAIN', 'keyed:KEYED', 'nested:NESTED']);
	});

	it('keeps an implicit position distinct from an explicit key and a nested wrapper', async () => {
		const plain = deferred<string>();
		const keyed = deferred<string>();
		const nested = deferred<string>();
		const scenario: ListScenario = {
			phase: 'keyed-first',
			plain: plain.promise,
			keyed: keyed.promise,
			nested: nested.promise,
		};

		// The first pass reaches the keyed row at position zero and suspends.
		// On retry a new unkeyed row occupies that position, while the keyed
		// row moves beside it and the nested keyed row keeps its own boundary.
		const pending = prerender(Page, { scenario });
		scenario.phase = 'mixed';
		keyed.resolve('KEYED');
		plain.resolve('PLAIN');
		nested.resolve('NESTED');

		expect(rows((await pending).html)).toEqual(['plain:PLAIN', 'keyed:KEYED', 'nested:NESTED']);
	});

	it('keeps interleaved requests isolated when list shape changes during suspension', async () => {
		const a = {
			plain: deferred<string>(),
			keyed: deferred<string>(),
			nested: deferred<string>(),
		};
		const b = {
			plain: deferred<string>(),
			keyed: deferred<string>(),
			nested: deferred<string>(),
		};
		const first: ListScenario = {
			phase: 'keyed-first',
			plain: a.plain.promise,
			keyed: a.keyed.promise,
			nested: a.nested.promise,
		};
		const second: ListScenario = {
			phase: 'keyed-first',
			plain: b.plain.promise,
			keyed: b.keyed.promise,
			nested: b.nested.promise,
		};
		const firstResult = prerender(Page, { scenario: first });
		const secondResult = prerender(Page, { scenario: second });
		first.phase = 'mixed';
		second.phase = 'mixed';
		b.keyed.resolve('B-KEYED');
		a.keyed.resolve('A-KEYED');
		a.plain.resolve('A-PLAIN');
		b.plain.resolve('B-PLAIN');
		b.nested.resolve('B-NESTED');
		a.nested.resolve('A-NESTED');

		const [firstHtml, secondHtml] = await Promise.all([firstResult, secondResult]);
		expect(rows(firstHtml.html)).toEqual(['plain:A-PLAIN', 'keyed:A-KEYED', 'nested:A-NESTED']);
		expect(rows(secondHtml.html)).toEqual(['plain:B-PLAIN', 'keyed:B-KEYED', 'nested:B-NESTED']);
	});

	it('reveals unkeyed, explicitly keyed, and nested rows out of order in a stream', async () => {
		const plain = deferred<string>();
		const keyed = deferred<string>();
		const nested = deferred<string>();
		const scenario: ListScenario = {
			phase: 'mixed',
			plain: plain.promise,
			keyed: keyed.promise,
			nested: nested.promise,
		};
		const output = createPipeableCollector();
		const errors: unknown[] = [];
		const stream = renderToPipeableStream(
			StreamingPage,
			{ scenario },
			{
				onError: (error) => errors.push(error),
			},
		);
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			stream.pipe(output.destination);
			await vi.waitFor(() => {
				expect(rows(output.chunks.join(''))).toEqual([
					'plain:waiting',
					'keyed:waiting',
					'nested:waiting',
				]);
			});

			nested.resolve('NESTED');
			await vi.waitFor(() => expect(output.chunks.join('')).toContain('NESTED'));
			plain.resolve('PLAIN');
			await vi.waitFor(() => expect(output.chunks.join('')).toContain('PLAIN'));
			keyed.resolve('KEYED');
			container.innerHTML = await output.ended;
			activateStreamedMarkup(container);
			expect(rows(container.innerHTML)).toEqual(['plain:PLAIN', 'keyed:KEYED', 'nested:NESTED']);
			expect(errors).toEqual([]);
		} finally {
			stream.abort();
			container.remove();
			resetStreamRuntimeGlobals();
		}
	});
});
