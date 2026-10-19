import {
	Activity,
	ErrorBoundary,
	createElement,
	createRoot,
	flushSync,
	memo,
	useLayoutEffect,
	type Root,
	type OctaneNode,
} from 'octane';
import { motion } from '@octanejs/motion';

interface Options {
	count: number;
	version: number;
	width: number;
	left: number;
	mode: 'visible' | 'hidden';
	cached: boolean;
	barrierAfter: number;
	boundaries: boolean;
	overflow: string;
	initialScroll: number;
	ancestorTransform: string;
}
const observeSlot = Symbol('layout-observer');
let root: Root | undefined;
let options: Options;
let cachedChildren: OctaneNode;
export const observations: string[][] = [];
let barrier: (() => void) | undefined;
export function onBarrier(callback?: () => void): void {
	barrier = callback;
}

function Observer() {
	useLayoutEffect(
		() => {
			observations.push(nodes().map((node) => node.style.transform));
			barrier?.();
		},
		undefined,
		observeSlot,
	);
	return null;
}
function Rows(props: Options) {
	const rows = [];
	for (let i = 0; i < props.count; i++) {
		const row = createElement(motion.div, {
			id: `row-${i}`,
			key: i,
			layout: true,
			transition: { duration: 0 },
			className: 'row',
			style: { width: `${props.width}px`, height: '20px', transform: 'translateX(2px)' },
			'data-version': props.version,
			children: String(i),
		});
		rows.push(
			props.boundaries
				? createElement(ErrorBoundary, {
						key: i,
						children: row,
						fallback: createElement('strong', { id: `failed-${i}`, children: 'caught' }),
					})
				: row,
		);
		if (i + 1 === props.barrierAfter) rows.push(createElement(Observer, { key: 'observer' }));
	}
	return rows;
}
const CachedRows = memo(Rows);
function App(props: Options) {
	return createElement('section', {
		id: 'layout-parent',
		ref: (node: HTMLElement | null) => {
			if (node && props.initialScroll) node.scrollLeft = props.initialScroll;
		},
		style: {
			position: 'relative',
			left: `${props.left}px`,
			width: props.overflow ? '100px' : '300px',
			height: props.overflow ? '60px' : 'auto',
			overflow: props.overflow,
			transform: props.ancestorTransform,
		},
		children: createElement(Rows, props),
	});
}
export function mount(input: Partial<Options> = {}): void {
	unmount();
	observations.length = 0;
	barrier = undefined;
	options = {
		count: 4,
		version: 0,
		width: 100,
		left: 0,
		mode: 'visible',
		cached: false,
		barrierAfter: 0,
		boundaries: false,
		overflow: '',
		initialScroll: 0,
		ancestorTransform: '',
		...input,
	};
	cachedChildren = createElement(CachedRows, options);
	const container = document.getElementById('main')!;
	if (options.cached) {
		const parent = document.createElement('section');
		parent.id = 'layout-parent';
		parent.style.cssText = 'position:relative;width:300px';
		container.replaceChildren(parent);
		root = createRoot(parent);
		root.render(createElement(Activity, { mode: options.mode, children: cachedChildren }));
	} else {
		root = createRoot(container);
		root.render(App, options);
	}
	flushSync(() => {});
}
export function update(input: Partial<Options> = {}): void {
	options = { ...options, version: options.version + 1, ...input };
	if ('version' in input) cachedChildren = createElement(CachedRows, options);
	flushSync(() => {
		if (options.cached)
			root!.render(createElement(Activity, { mode: options.mode, children: cachedChildren }));
		else root!.render(App, options);
	});
}
export function nodes(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('.row')];
}
export function snapshot() {
	return nodes().map((node) => ({
		id: node.id,
		transform: node.style.transform,
		version: node.dataset.version,
		left: node.getBoundingClientRect().left,
		top: node.getBoundingClientRect().top,
		width: node.getBoundingClientRect().width,
		height: node.getBoundingClientRect().height,
	}));
}
export function unmount(): void {
	root?.unmount();
	root = undefined;
	document.getElementById('main')?.replaceChildren();
}
