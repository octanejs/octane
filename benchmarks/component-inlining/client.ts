import { createRoot, flushSync, type ComponentBody } from 'octane';

type Props = { rows: readonly { id: number }[]; tick: number; text: string };
type Case = { id: string; depth: number; layout: string; App: ComponentBody<Props> };

export function install(cases: Case[], scenario: 'static' | 'dynamic' | 'delegation' = 'static') {
	const container = document.getElementById('mount')!;
	let current = cases[0];
	let root: ReturnType<typeof createRoot> | undefined;
	let rows: { id: number }[] = [];
	let tick = 0;
	let text = 'initial';
	let childCount = 0;
	let stateButton: HTMLButtonElement | undefined;
	let retained: Element[] = [];
	let retainedText: Node[] = [];
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
		text = 'initial';
		retained = [];
		retainedText = [];
		draft = undefined;
	}
	function props() {
		return scenario === 'static' ? { rows, tick } : { rows, tick, text };
	}
	function mount() {
		check(!root, 'not already mounted');
		childCount = 0;
		root = createRoot(container);
		root.render(current.App, props());
	}
	function update() {
		check(root, 'mounted');
		tick++;
		flushSync(() => root!.render(current.App, props()));
	}
	function changedLeaf() {
		check(scenario !== 'static', 'changedLeaf requires a dynamic input');
		text = `value-${tick + 1}`;
		update();
	}
	function childSelfUpdate() {
		check(scenario === 'delegation' && root, 'mounted delegation child');
		stateButton ??= container.querySelector<HTMLButtonElement>('button[data-action="increment"]')!;
		check(stateButton, 'first row state button');
		flushSync(() => stateButton!.click());
		childCount++;
	}
	function textNodes() {
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const nodes: Node[] = [];
		for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
		return nodes;
	}
	function unmount() {
		check(root, 'mounted');
		root.unmount();
		root = undefined;
		stateButton = undefined;
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
			check(layers.length === (scenario === 'delegation' ? 0 : current.depth), 'host depth');
			let parent: Element = article;
			for (let level = 0; level < layers.length; level++) {
				check(
					layers[level].parentElement === parent &&
						layers[level].getAttribute('data-layer') === String(level),
					'host nesting',
				);
				parent = layers[level];
			}
			if (scenario === 'delegation') {
				const leaf = article.querySelector(':scope > div[data-leaf]');
				check(
					leaf && leaf.getAttribute('data-child-row') === String(index),
					'terminal child identity',
				);
				check(
					leaf.querySelector(':scope > button')?.textContent ===
						String(index === 0 ? childCount : 0),
					'independent child state',
				);
				parent = leaf;
			}
			check(
				parent.querySelector(':scope > span[data-value]')?.textContent ===
					(scenario === 'static' ? 'fixed' : text) &&
					parent.querySelector(':scope > em')?.textContent === 'tail',
				'current child output',
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
			const nowText = textNodes();
			check(
				nowText.length === retainedText.length &&
					nowText.every((node, index) => node === retainedText[index]),
				'retained Text nodes',
			);
		}
		return { rows: articles.length, elements: container.querySelectorAll('*').length, tick };
	}
	function retain() {
		verify();
		retained = [...container.querySelectorAll('*')];
		retainedText = textNodes();
		draft = container.querySelector('input')!;
		draft.value = 'edited draft';
	}
	function verifyEmpty() {
		check(!root && container.childNodes.length === 0, 'teardown');
	}
	function verifyOwnerRetirement() {
		check(scenario === 'delegation' && !root, 'retirement control starts unmounted');
		mount();
		const button = container.querySelector<HTMLButtonElement>('button[data-action="increment"]');
		check(button, 'retirement control button');
		button.click();
		check(button.textContent === '0', 'native child update remains queued before unmount');
		unmount();
		const retiredText = button.textContent;
		flushSync(() => {});
		verifyEmpty();
		check(button.textContent === retiredText, 'retired child did not render into detached DOM');
		return { clickBeforeUnmount: true, emptyAfterFlush: true, detachedButtonText: retiredText };
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
			check(
				['update', 'changedLeaf', 'equalProps', 'childSelfUpdate'].includes(operation),
				'known update operation',
			);
			if (!root) mount();
			if (operation === 'childSelfUpdate') {
				stateButton = container.querySelector<HTMLButtonElement>(
					'button[data-action="increment"]',
				)!;
				check(stateButton, 'state button selected outside timer');
			}
			const operationFn =
				operation === 'changedLeaf'
					? changedLeaf
					: operation === 'childSelfUpdate'
						? childSelfUpdate
						: update;
			const start = performance.now();
			for (let i = 0; i < repetitions; i++) operationFn();
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
			changedLeaf,
			equalProps: update,
			childSelfUpdate,
			unmount,
			verify,
			retain,
			verifyEmpty,
			verifyOwnerRetirement,
			timed,
		},
		__ready: true,
	});
}
