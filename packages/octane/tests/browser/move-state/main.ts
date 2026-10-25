import { createElement, createRoot, flushSync, type Root } from '../../../src/index.js';
import { mountBoundRows } from './bound-rows.tsrx';
import { CompiledRows, type StatefulRow } from './rows.tsrx';

type RowKind = 'compiled' | 'descriptor' | 'binding';

const rows: StatefulRow[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

let root: Root | undefined;
let bound: ReturnType<typeof mountBoundRows> | undefined;
let kind: RowKind = 'compiled';
let primed = new Map<number, { article: Element; animation: Animation }>();

function DescriptorRows(props: { items: readonly StatefulRow[] }) {
	return createElement('section', {
		children: props.items.map((row) =>
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

async function mount(nextKind: RowKind): Promise<void> {
	root?.unmount();
	root = undefined;
	bound?.dispose();
	bound = undefined;
	kind = nextKind;
	const container = document.querySelector('#root')!;
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

function reverse() {
	flushSync(() => render(rows.toReversed()));
	return articles().map((article) => {
		const id = Number(article.dataset['row']);
		const before = primed.get(id)!;
		const frame = article.querySelector('iframe');
		const animation = article.querySelector('.spinner')!.getAnimations()[0];
		return {
			id,
			sameArticle: article === before.article,
			frameMarker:
				frame === null
					? id
					: (frame.contentWindow as (Window & { rowMarker?: number }) | null)?.rowMarker,
			sameAnimation: animation === before.animation,
			animationTime: Number(animation?.currentTime ?? 0),
			popoverOpen: article.querySelector('[popover]')!.matches(':popover-open'),
		};
	});
}

window.__moveState = { mount, reverse };

declare global {
	interface Window {
		__moveState: { mount: typeof mount; reverse: typeof reverse };
	}
}
