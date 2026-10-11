import { createRoot, flushSync, type ComponentBody } from 'octane';

type Props = { rows: readonly { id: number }[]; tick: number };
type Case = { id: string; depth: number; layout: string; App: ComponentBody<Props> };

export function install(cases: Case[]) {
	const container = document.getElementById('mount')!;
	let current = cases[0];
	let root: ReturnType<typeof createRoot> | undefined;
	let rows: { id: number }[] = [];
	let tick = 0;
	let retained: Element[] = [];
	let draft: HTMLInputElement | undefined;
	function check(ok: unknown, message: string): asserts ok {
		if (!ok) throw new Error(message);
	}
	function prepare(id: string, count = 256) {
		check(!root, 'unmount previous case');
		const found = cases.find((item) => item.id === id);
		check(found, 'known case');
		current = found;
		rows = Array.from({ length: count }, (_, id) => ({ id }));
		tick = 0;
		retained = [];
		draft = undefined;
	}
	function mount() {
		check(!root, 'not already mounted');
		root = createRoot(container);
		root.render(current.App, { rows, tick });
	}
	function update() {
		check(root, 'mounted');
		tick++;
		flushSync(() => root!.render(current.App, { rows, tick }));
	}
	function unmount() {
		check(root, 'mounted');
		root.unmount();
		root = undefined;
	}
	function verify(identity = false) {
		check(
			container.querySelector('main')?.getAttribute('data-tick') === String(tick),
			'ancestor attribute',
		);
		const articles = [...container.querySelectorAll('article')];
		check(articles.length === rows.length, 'row count');
		for (let index = 0; index < articles.length; index++) {
			const article = articles[index];
			check(article.getAttribute('data-row') === String(index), 'row identity');
			const layers = [...article.querySelectorAll('div[data-layer]')];
			check(layers.length === current.depth, 'host depth');
			let parent: Element = article;
			for (let level = 0; level < layers.length; level++) {
				check(
					layers[level].parentElement === parent &&
						layers[level].getAttribute('data-layer') === String(level),
					'host nesting',
				);
				parent = layers[level];
			}
			check(
				parent.querySelector(':scope > span[data-value]')?.textContent === 'fixed' &&
					parent.querySelector(':scope > em')?.textContent === 'tail',
				'static child output',
			);
			check(article.querySelectorAll(':scope > input').length === 1, 'input outside fusion region');
		}
		if (identity) {
			const now = [...container.querySelectorAll('*')];
			check(
				now.length === retained.length && now.every((node, index) => node === retained[index]),
				'retained nodes',
			);
			check(draft?.value === 'edited draft', 'retained draft');
		}
		return { rows: articles.length, elements: container.querySelectorAll('*').length, tick };
	}
	function retain() {
		verify();
		retained = [...container.querySelectorAll('*')];
		draft = container.querySelector('input')!;
		draft.value = 'edited draft';
	}
	function verifyEmpty() {
		check(!root && container.childNodes.length === 0, 'teardown');
	}
	function timed(operation: string, repetitions: number) {
		check(repetitions > 0, 'positive repetitions');
		let milliseconds = 0;
		if (operation === 'mount' || operation === 'unmount') {
			if (root) unmount();
			for (let i = 0; i < repetitions; i++) {
				if (operation === 'unmount') mount();
				const start = performance.now();
				if (operation === 'mount') mount();
				else unmount();
				milliseconds += performance.now() - start;
				if (operation === 'mount' && i + 1 < repetitions) unmount();
			}
			if (operation === 'mount') verify();
			else verifyEmpty();
		} else {
			if (!root) mount();
			const start = performance.now();
			for (let i = 0; i < repetitions; i++) update();
			milliseconds = performance.now() - start;
			verify();
		}
		return { milliseconds, repetitions, perOperation: milliseconds / repetitions };
	}
	Object.assign(window, {
		__inlining: {
			cases: cases.map(({ App: _App, ...item }) => item),
			prepare,
			mount,
			update,
			unmount,
			verify,
			retain,
			verifyEmpty,
			timed,
		},
		__ready: true,
	});
}
