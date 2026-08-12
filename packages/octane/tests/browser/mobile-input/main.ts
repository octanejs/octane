import { createElement, createRoot, flushSync, type Root } from '../../../src/index.js';
import { NestedConditionalList } from '../../_fixtures/for.tsrx';

type ListKind = 'compiled' | 'descriptor';
type TouchName = 'touchmove' | 'touchstart';

const rows = [
	{ id: 1, label: 'first field' },
	{ id: 2, label: 'second field' },
	{ id: 3, label: 'third field' },
	{ id: 4, label: 'fourth field' },
];

let root: Root | undefined;
let input: HTMLInputElement;
let queryRoot: Document | ShadowRoot = document;
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
	} else {
		root!.render(DescriptorRows, { items: currentRows });
	}
}

function mount(nextKind: ListKind, nextFocusedId: number, shadow = false): void {
	root?.unmount();
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
	root = createRoot(container);
	renderRows();
	flushSync(() => {});
	input =
		kind === 'compiled'
			? queryRoot.querySelector<HTMLInputElement>('.nested-conditional-editor')!
			: queryRoot.querySelector<HTMLInputElement>(`[data-row="${focusedId}"]`)!;
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
			: Array.from(queryRoot.querySelectorAll<HTMLInputElement>('#descriptor-rows input'), (node) =>
					Number(node.dataset.row),
				);
	return {
		order,
		focused: (input.getRootNode() as Document | ShadowRoot).activeElement === input,
		connected: input.isConnected,
		same:
			kind === 'compiled'
				? queryRoot.querySelector('.nested-conditional-editor') === input
				: queryRoot.querySelector(`[data-row="${focusedId}"]`) === input,
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

window.__mobileInput = { mount, reverse, snapshot, cancelBodyTouch };

declare global {
	interface Window {
		__mobileInput: {
			mount: typeof mount;
			reverse: typeof reverse;
			snapshot: typeof snapshot;
			cancelBodyTouch: typeof cancelBodyTouch;
		};
	}
}
