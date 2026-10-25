import {
	createElement,
	createRoot,
	flushSync,
	type OctaneNode,
	type Root,
} from '../../../src/index.js';
import { mountBoundRows } from './bound-rows.tsrx';
import { CompiledRows, FormParentRows, FormRows, TipRows, type StatefulRow } from './rows.tsrx';

type RowKind = 'compiled' | 'descriptor' | 'binding';

const allRows: StatefulRow[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

let root: Root | undefined;
let bound: ReturnType<typeof mountBoundRows> | undefined;
let kind: RowKind = 'compiled';
let rows = allRows;
let primed = new Map<number, { article: Element; animation: Animation }>();

// Creates a tooltip beside itself and dismisses it when it is moved, as a
// popover-style widget would when its anchor relocates.
class MoveTip extends HTMLElement {
	tip: HTMLElement | null = null;
	showTip(): void {
		this.tip = document.createElement('span');
		this.tip.className = 'tooltip';
		this.after(this.tip);
	}
	connectedMoveCallback(): void {
		this.tip?.remove();
		this.tip = null;
	}
}
customElements.define('move-tip', MoveTip);

function DescriptorRows(props: { items: readonly StatefulRow[]; form?: boolean }) {
	const children: OctaneNode[] = props.items.map((row) =>
		createElement('article', {
			key: row.id,
			'data-row': String(row.id),
			children: [
				createElement('iframe', { key: 'frame', srcDoc: '<p>frame</p>' }),
				createElement('div', { key: 'spinner', className: 'spinner' }),
				createElement('div', {
					key: 'popover',
					popover: 'manual',
					children: `popover ${row.id}`,
				}),
				createElement('div', {
					key: 'editor',
					className: 'editor',
					contentEditable: true,
					suppressContentEditableWarning: true,
					children: 'editable text',
				}),
			],
		}),
	);
	// A form's named controls shadow its DOM members, including isConnected.
	if (props.form)
		children.push(
			createElement('form', {
				key: 'form',
				children: createElement('input', { name: 'isConnected' }),
			}),
		);
	return createElement('section', { children });
}

// Form rows that shadow `nextSibling`, each with an editor that can hold focus.
// Descriptor reconciliation moves a focused row, rotating its siblings.
function EditorFormRows(props: { items: readonly StatefulRow[] }) {
	return createElement('section', {
		children: props.items.map((row) =>
			createElement('form', {
				key: row.id,
				'data-row': String(row.id),
				children: [
					createElement('input', { key: 'shadow', name: 'nextSibling' }),
					createElement('div', {
						key: 'editor',
						className: 'editor',
						contentEditable: true,
						suppressContentEditableWarning: true,
						children: `row ${row.id}`,
					}),
				],
			}),
		),
	});
}

function render(items: readonly StatefulRow[]): void {
	if (kind === 'binding') bound!.update(items);
	else if (kind === 'compiled') root!.render(CompiledRows, { items });
	else root!.render(DescriptorRows, { items });
}

function articles(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('#root article'));
}

function reset(): Element {
	root?.unmount();
	root = undefined;
	bound?.dispose();
	bound = undefined;
	return document.querySelector('#root')!;
}

async function mount(nextKind: RowKind, count = allRows.length): Promise<void> {
	const container = reset();
	kind = nextKind;
	rows = allRows.slice(0, count);
	if (kind === 'binding') bound = mountBoundRows(container, rows);
	else root = createRoot(container);
	flushSync(() => render(rows));
	// Give every row live state that a detaching move would reset: a loaded
	// frame with its own globals, a running CSS animation, and an open popover.
	primed = new Map();
	for (const article of articles()) {
		const id = Number(article.dataset['row']);
		const frame = article.querySelector('iframe');
		if (frame !== null) {
			await new Promise<void>((resolve) => {
				if (frame.contentDocument?.querySelector('p')) resolve();
				else frame.addEventListener('load', () => resolve(), { once: true });
			});
			(frame.contentWindow as Window & { rowMarker?: number }).rowMarker = id;
		}
		const animation = article.querySelector('.spinner')!.getAnimations()[0]!;
		animation.currentTime = 50_000;
		article.querySelector<HTMLElement>('[popover]')!.showPopover();
		primed.set(id, { article, animation });
	}
}

function rowState(article: HTMLElement) {
	const id = Number(article.dataset['row']);
	const before = primed.get(id)!;
	const frame = article.querySelector('iframe');
	const animation = article.querySelector('.spinner')!.getAnimations()[0];
	return {
		id,
		sameArticle: article === before.article,
		frameMarker:
			frame === null
				? null
				: ((frame.contentWindow as (Window & { rowMarker?: number }) | null)?.rowMarker ?? null),
		sameAnimation: animation === before.animation,
		animationTime: Number(animation?.currentTime ?? 0),
		popoverOpen: article.querySelector('[popover]')!.matches(':popover-open'),
	};
}

function reverse() {
	flushSync(() => render(rows.toReversed()));
	return articles().map(rowState);
}

/** Select text in the last row's editor, then reverse the rows around it. */
function reverseBesideEditor() {
	const editor = articles().at(-1)!.querySelector<HTMLElement>('.editor')!;
	const text = editor.firstChild!;
	editor.focus();
	const selection = getSelection()!;
	const range = document.createRange();
	range.setStart(text, 2);
	range.setEnd(text, 7);
	selection.removeAllRanges();
	selection.addRange(range);
	const placed = reverse();
	return {
		placed,
		focused: document.activeElement === editor,
		selection: [
			selection.anchorNode === text,
			selection.anchorOffset,
			selection.focusNode === text,
			selection.focusOffset,
		],
	};
}

function insertFormIntoMountedSection() {
	const container = reset();
	kind = 'descriptor';
	root = createRoot(container);
	flushSync(() => root!.render(DescriptorRows, { items: allRows.slice(0, 2) }));
	flushSync(() => root!.render(DescriptorRows, { items: allRows.slice(0, 2), form: true }));
	const form = container.querySelector('section > form');
	return {
		formPlaced: form !== null && form.previousElementSibling?.localName === 'article',
		controlInside: form?.querySelector('input[name="isConnected"]') !== null,
	};
}

function reverseFormRows() {
	const container = reset();
	root = createRoot(container);
	const items = allRows.slice(0, 3);
	flushSync(() => root!.render(FormRows, { items }));
	const before = Array.from(container.querySelectorAll('article'));
	flushSync(() => root!.render(FormRows, { items: items.toReversed() }));
	const after = Array.from(container.querySelectorAll('article'));
	return {
		order: after.map((article) => Number(article.dataset['row'])),
		sameNodes: after.every((article, index) => article === before[before.length - 1 - index]),
	};
}

function reverseTipRows(focus: 'none' | 'other' | 'editor') {
	const container = reset();
	root = createRoot(container);
	const items = allRows.slice(0, 3);
	flushSync(() => root!.render(TipRows, { items }));
	for (const tip of container.querySelectorAll<MoveTip>('move-tip')) tip.showTip();
	let focused: HTMLElement | null = null;
	if (focus === 'other') focused = container.querySelector<HTMLInputElement>('#tip-other')!;
	// The last row's editor makes its row rotate the other rows around it.
	if (focus === 'editor')
		focused = Array.from(container.querySelectorAll<HTMLElement>('i')).at(-1)!;
	focused?.focus();
	flushSync(() => root!.render(TipRows, { items: items.toReversed() }));
	const children = Array.from(container.querySelector('section')!.children);
	return {
		rows: children
			.filter((child) => child.className !== 'tooltip')
			.map((child) =>
				child.localName === 'move-tip'
					? `tip ${(child as HTMLElement).dataset['row']}`
					: child.localName === 'i'
						? child.textContent
						: child.id,
			),
		// A tooltip that survived belongs to an unmoved row and sits beside it.
		strayTooltips: children.filter(
			(child, index) =>
				child.className === 'tooltip' && children[index - 1]?.localName !== 'move-tip',
		).length,
		focusKept: focused === null || document.activeElement === focused,
	};
}

function reverseFormParentRows() {
	const container = reset();
	root = createRoot(container);
	const items = allRows.slice(0, 3);
	flushSync(() => root!.render(FormParentRows, { items }));
	flushSync(() => root!.render(FormParentRows, { items: items.toReversed() }));
	return Array.from(container.querySelector('section')!.children, (child) =>
		child.localName === 'form'
			? `form ${(child as HTMLElement).dataset['row']}`
			: child.textContent,
	);
}

/**
 * Move the last row, which holds a focused editor, to the front. Descriptor
 * reconciliation moves that row, rotating the other rows around it.
 */
function moveFocusedEditorFormRow() {
	const container = reset();
	root = createRoot(container);
	flushSync(() => root!.render(EditorFormRows, { items: allRows }));
	const moved = allRows.at(-1)!;
	const editor = container.querySelector<HTMLElement>(`form[data-row="${moved.id}"] .editor`)!;
	editor.focus();
	const rest = allRows.filter((row) => row !== moved);
	flushSync(() => root!.render(EditorFormRows, { items: [moved, ...rest] }));
	return {
		// Every direct child must be a whole form row: a broken walk pulls form
		// controls out into the section.
		children: Array.from(container.querySelector('section')!.children, (child) =>
			child.localName === 'form' ? Number((child as HTMLElement).dataset['row']) : child.localName,
		),
		focused: document.activeElement === editor,
	};
}

window.__moveState = {
	mount,
	reverse,
	reverseBesideEditor,
	insertFormIntoMountedSection,
	reverseFormRows,
	reverseTipRows,
	reverseFormParentRows,
	moveFocusedEditorFormRow,
};

declare global {
	interface Window {
		__moveState: {
			mount: typeof mount;
			reverse: typeof reverse;
			reverseBesideEditor: typeof reverseBesideEditor;
			insertFormIntoMountedSection: typeof insertFormIntoMountedSection;
			reverseFormRows: typeof reverseFormRows;
			reverseTipRows: typeof reverseTipRows;
			reverseFormParentRows: typeof reverseFormParentRows;
			moveFocusedEditorFormRow: typeof moveFocusedEditorFormRow;
		};
	}
}
