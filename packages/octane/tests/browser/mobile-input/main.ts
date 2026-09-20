import { createElement, createRoot, flushSync, type Root } from '../../../src/index.js';
import { NestedConditionalList } from '../../_fixtures/for.tsrx';
import { mountPresentationRows } from './presentation.tsrx';
import { createRelocatingNativeEditors } from '../../_fixtures/relocating-native-editor.js';

type ListKind = 'compiled' | 'descriptor' | 'presentation';
type TouchName = 'touchmove' | 'touchstart';

const rows = [
	{ id: 1, label: 'first field' },
	{ id: 2, label: 'second field' },
	{ id: 3, label: 'third field' },
	{ id: 4, label: 'fourth field' },
];

let root: Root | undefined;
let presentation: ReturnType<typeof mountPresentationRows> | undefined;
let input: HTMLInputElement;
let queryRoot: Document | ShadowRoot = document;
let inputRoot: Document | ShadowRoot = document;
let focusedId = 0;
let currentRows = rows;
let kind: ListKind = 'compiled';
let interruptions: string[] = [];
let compositions: string[] = [];

function DescriptorRows(props: { items: typeof rows }) {
	return createElement('section', {
		id: 'descriptor-rows',
		children: props.items.map((row) =>
			createElement('input', {
				key: row.id,
				'data-row': row.id,
				defaultValue: row.label,
			}),
		),
	});
}

function renderRows(): void {
	if (kind === 'compiled') {
		root!.render(NestedConditionalList, {
			items: currentRows,
			editing: focusedId,
			prefix: 'row',
			onSelect() {},
		});
	} else if (kind === 'presentation') {
		presentation!.update(currentRows);
	} else {
		root!.render(DescriptorRows, { items: currentRows });
	}
}

function mount(
	nextKind: ListKind,
	nextFocusedId: number,
	shadow = false,
	shadowEditor = false,
): void {
	root?.unmount();
	root = undefined;
	presentation?.dispose();
	presentation = undefined;
	kind = nextKind;
	focusedId = nextFocusedId;
	currentRows = rows;
	interruptions = [];
	compositions = [];
	const outer = document.querySelector('#root')!;
	queryRoot = document;
	let container: Element = outer;
	if (shadow) {
		const host = document.createElement('div');
		host.id = 'shadow-host';
		outer.appendChild(host);
		queryRoot = host.attachShadow({ mode: 'open' });
		container = document.createElement('section');
		queryRoot.appendChild(container);
	}
	if (kind === 'presentation')
		presentation = mountPresentationRows(container, currentRows, shadowEditor);
	else root = createRoot(container);
	renderRows();
	flushSync(() => {});
	inputRoot = shadowEditor
		? queryRoot.querySelector(`[data-editor-id="${focusedId}"]`)!.shadowRoot!
		: queryRoot;
	input =
		kind === 'compiled'
			? inputRoot.querySelector<HTMLInputElement>('.nested-conditional-editor')!
			: kind === 'presentation'
				? inputRoot.querySelector<HTMLInputElement>(`input[name="${focusedId}"]`)!
				: inputRoot.querySelector<HTMLInputElement>(`[data-row="${focusedId}"]`)!;
	for (const name of ['blur', 'focusout']) {
		input.addEventListener(name, () => interruptions.push(name));
	}
	for (const name of ['compositionstart', 'compositionupdate', 'compositionend']) {
		input.addEventListener(name, (event) =>
			compositions.push(`${event.type}:${(event as CompositionEvent).data}`),
		);
	}
}

function snapshot() {
	const order =
		kind === 'compiled'
			? Array.from(
					queryRoot.querySelectorAll('.nested-conditional-label'),
					(node) => rows.find((row) => row.label === node.textContent)!.id,
				)
			: kind === 'presentation'
				? Array.from(queryRoot.querySelectorAll('figure'), (node) =>
						Number(node.getAttribute('data-file')),
					)
				: Array.from(
						queryRoot.querySelectorAll<HTMLInputElement>('#descriptor-rows input'),
						(node) => Number(node.dataset.row),
					);
	return {
		order,
		focused: (input.getRootNode() as Document | ShadowRoot).activeElement === input,
		connected: input.isConnected,
		same:
			kind === 'compiled'
				? inputRoot.querySelector('.nested-conditional-editor') === input
				: kind === 'presentation'
					? inputRoot.querySelector(`input[name="${focusedId}"]`) === input
					: inputRoot.querySelector(`[data-row="${focusedId}"]`) === input,
		value: input.value,
		selection: [input.selectionStart, input.selectionEnd],
		interruptions: interruptions.slice(),
		compositions: compositions.slice(),
	};
}

function reverse() {
	currentRows = rows.toReversed();
	flushSync(renderRows);
	return snapshot();
}

function restoreRelocatedEditor(position: 'first' | 'last', shadow = false) {
	root?.unmount();
	root = undefined;
	presentation?.dispose();
	presentation = undefined;
	const external = document.createElement('section');
	const sourceSibling = document.createElement('span');
	sourceSibling.textContent = 'external editor toolbar';
	external.appendChild(sourceSibling);
	document.body.appendChild(external);
	const focusedId = position === 'first' ? 2 : 1;
	const order = position === 'first' ? [2, 1, 3, 4] : [2, 3, 4, 1];
	const Editors = createRelocatingNativeEditors(external, focusedId, shadow);
	try {
		root = createRoot(document.querySelector('#root')!);
		root.render(Editors, { items: rows, revision: 0 });
		flushSync(() => {});
		const parent = document.querySelector('#root section')!;
		const initial = Array.from(parent.children);
		const host = initial[focusedId - 1]!;
		const input = (host.shadowRoot ?? host).querySelector('input')!;
		input.focus();
		input.setSelectionRange(2, 9);

		flushSync(() =>
			root!.render(Editors, { items: order.map((id) => rows[id - 1]!), revision: 1 }),
		);

		const placed = Array.from(parent.children);
		return {
			order: placed.map((host) => Number(host.getAttribute('data-row'))),
			sameHosts: placed.every((host, index) => host === initial[order[index]! - 1]),
			sourceRetained: external.childNodes.length === 1 && external.firstChild === sourceSibling,
			sameInput: (host.shadowRoot ?? host).querySelector('input') === input,
			connected: input.isConnected,
			focused: (input.getRootNode() as Document | ShadowRoot).activeElement === input,
			selection: [input.selectionStart, input.selectionEnd],
			value: input.value,
		};
	} finally {
		try {
			root?.unmount();
			root = undefined;
		} finally {
			external.remove();
		}
	}
}

function cancelBodyTouch(name: TouchName, capture: boolean) {
	root?.unmount();
	let observed = false;
	const prop =
		name === 'touchstart'
			? capture
				? 'onTouchStartCapture'
				: 'onTouchStart'
			: capture
				? 'onTouchMoveCapture'
				: 'onTouchMove';
	root = createRoot(document.body);
	root.render(
		createElement('button', {
			id: 'touch-target',
			[prop](event: Event) {
				event.preventDefault();
				observed = event.defaultPrevented;
			},
		}),
	);
	flushSync(() => {});
	const event = new Event(name, { bubbles: true, cancelable: true });
	document.querySelector('#touch-target')!.dispatchEvent(event);
	return { observed, defaultPrevented: event.defaultPrevented };
}

window.__mobileInput = { mount, reverse, snapshot, cancelBodyTouch, restoreRelocatedEditor };

declare global {
	interface Window {
		__mobileInput: {
			mount: typeof mount;
			reverse: typeof reverse;
			snapshot: typeof snapshot;
			cancelBodyTouch: typeof cancelBodyTouch;
			restoreRelocatedEditor: typeof restoreRelocatedEditor;
		};
	}
}
