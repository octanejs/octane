import { describe, expect, it } from 'vitest';
import { use, useState, useTransition } from 'octane';
import { act, mount } from './_helpers';

// Rows of one list that suspend in the same boundary. Every row's request must
// start in the pass that first reaches the list, not one row per retry, and the
// boundary must still show only complete, current content.

interface Request {
	id: number;
	promise: Promise<string>;
	resolve: (value: string) => void;
	reject: (reason: unknown) => void;
}

function createLoader() {
	const requests = new Map<number, Request>();
	return {
		requests,
		load(id: number): Promise<string> {
			let request = requests.get(id);
			if (request === undefined) {
				let resolve!: (value: string) => void;
				let reject!: (reason: unknown) => void;
				const promise = new Promise<string>((done, fail) => {
					resolve = done;
					reject = fail;
				});
				request = { id, promise, resolve, reject };
				requests.set(id, request);
			}
			return request.promise;
		},
		started(): number[] {
			return [...requests.keys()];
		},
		resolveAll() {
			for (const request of requests.values()) request.resolve(`v${request.id}`);
		},
	};
}
type Loader = ReturnType<typeof createLoader>;

// The request starts in the row's own render.
function LazyRow(props: { id: number; loader: Loader }) @{
	const value = use(props.loader.load(props.id));
	<li>{value as string}</li>
}

// A row that never suspends, between rows that do.
function PlainRow(props: { id: number }) @{
	<li>{`p${props.id}`}</li>
}

interface ListApi {
	setGen?: (gen: number) => void;
	setGenUrgently?: (gen: number) => void;
	isPending?: boolean;
}

function List(props: { loader: Loader; size: number; api: ListApi }) @{
	const [gen, setGen] = useState(0);
	const [isPending, start] = useTransition();
	props.api.setGen = (next) => start(() => setGen(next));
	props.api.setGenUrgently = setGen;
	props.api.isPending = isPending;
	const rows = Array.from({ length: props.size }, (_, k) => ({ k, id: gen * 100 + k }));
	<ul>
		@try {
			@for (const row of rows; key row.k) {
				@if (row.k % 3 === 2) {
					<PlainRow id={row.id} />
				} @else {
					<LazyRow id={row.id} loader={props.loader} />
				}
			}
		} @pending {
			<li>{'loading'}</li>
		} @catch (error) {
			<li>{`error: ${(error as Error).message}`}</li>
		}
	</ul>
}

const text = (container: HTMLElement) =>
	[...container.querySelectorAll('li')]
		.filter((li) => li.style.display !== 'none')
		.map((li) => li.textContent)
		.join(' ');

describe('suspending rows of one list', () => {
	it('start every request in the first pass and reveal together', async () => {
		const loader = createLoader();
		const view = mount(List, { loader, size: 6, api: {} });
		expect(text(view.container)).toBe('loading');
		// Before any data arrives, every suspending row has asked for its data.
		expect(loader.started()).toEqual([0, 1, 3, 4]);
		await act(async () => {
			loader.resolveAll();
		});
		expect(text(view.container)).toBe('v0 v1 p2 v3 v4 p5');
		view.unmount();
	});

	it('start every request of a transition update and hold the committed rows until all land', async () => {
		const loader = createLoader();
		const api: ListApi = {};
		const view = mount(List, { loader, size: 6, api });
		await act(async () => {
			loader.resolveAll();
		});
		expect(text(view.container)).toBe('v0 v1 p2 v3 v4 p5');

		await act(async () => {
			api.setGen!(1);
		});
		expect(loader.started()).toEqual([0, 1, 3, 4, 100, 101, 103, 104]);
		// Rows that rendered after a suspended row, including the ones that never
		// suspend, still show the committed screen.
		expect(text(view.container)).toBe('v0 v1 p2 v3 v4 p5');
		expect(api.isPending).toBe(true);

		await act(async () => {
			loader.requests.get(100)!.resolve('v100');
			loader.requests.get(103)!.resolve('v103');
		});
		expect(text(view.container)).toBe('v0 v1 p2 v3 v4 p5');

		await act(async () => {
			loader.resolveAll();
		});
		expect(text(view.container)).toBe('v100 v101 p102 v103 v104 p105');
		expect(api.isPending).toBe(false);
		view.unmount();
	});

	it('wait for an earlier pending row before reporting a later row error', async () => {
		const loader = createLoader();
		const view = mount(List, { loader, size: 2, api: {} });
		expect(loader.started()).toEqual([0, 1]);
		await act(async () => {
			loader.requests.get(1)!.reject(new Error('row 1'));
		});
		expect(text(view.container)).toBe('loading');
		await act(async () => {
			loader.requests.get(0)!.resolve('v0');
		});
		expect(text(view.container)).toBe('error: row 1');
		view.unmount();
	});

	it('start every request of an urgent update behind the fallback', async () => {
		const loader = createLoader();
		const api: ListApi = {};
		const view = mount(List, { loader, size: 3, api });
		await act(async () => {
			loader.resolveAll();
		});
		await act(async () => {
			api.setGenUrgently!(1);
		});
		expect(loader.started()).toEqual([0, 1, 100, 101]);
		expect(text(view.container)).toBe('loading');
		await act(async () => {
			loader.resolveAll();
		});
		expect(text(view.container)).toBe('v100 v101 p102');
		view.unmount();
	});
});
