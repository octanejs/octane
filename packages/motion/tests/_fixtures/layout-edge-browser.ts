import { createElement, createRoot, flushSync, type Root } from 'octane';
import { motion, MotionConfig } from '@octanejs/motion';
export { motionValue } from 'motion';

interface Options {
	left: number;
	top: number;
	width: number;
	height: number;
	origin?: string;
	transform?: string;
	scale?: number;
	rotate?: number;
	scroll: boolean;
	important: boolean;
	duration: number;
	transition?: Record<string, unknown>;
	style?: Record<string, unknown>;
	layout: boolean | 'position' | 'size';
	layoutId?: string;
	reducedMotion: 'never' | 'always';
}

let root: Root;
let options: Options;
let completed: (() => void) | undefined;

function onComplete(): void {
	const notify = completed;
	completed = undefined;
	notify?.();
}

function ref(node: HTMLElement | null): void {
	if (node && options.important) {
		node.style.setProperty('transform', 'translateX(20px)', 'important');
	}
}

function App(props: Options) {
	const content = createElement('section', {
		id: 'layout-parent',
		style: {
			position: 'relative',
			width: props.scroll ? '100px' : '1000px',
			height: props.scroll ? '60px' : '500px',
			overflow: props.scroll ? 'auto' : 'visible',
		},
		children: createElement(motion.div, {
			id: 'layout-target',
			className: 'layout-box',
			layout: props.layout,
			layoutId: props.layoutId,
			transition: props.transition ?? {
				layout: { duration: props.duration, ease: 'linear', onComplete },
			},
			ref,
			style: {
				position: props.scroll ? 'relative' : 'absolute',
				left: `${props.left}px`,
				top: `${props.top}px`,
				width: `${props.width}px`,
				height: `${props.height}px`,
				transformOrigin: props.origin,
				transform: props.transform,
				scale: props.scale,
				rotate: props.rotate,
				...props.style,
			},
			children: 'layout',
		}),
	});
	return createElement(MotionConfig, { reducedMotion: props.reducedMotion, children: content });
}

export function mount(input: Partial<Options> = {}): void {
	options = {
		left: 100,
		top: 100,
		width: 100,
		height: 50,
		scroll: false,
		important: false,
		duration: 0.25,
		layout: true,
		reducedMotion: 'never',
		...input,
	};
	root = createRoot(document.getElementById('main')!);
	root.render(App, options);
	flushSync(() => {});
}

export function update(input: Partial<Options> = {}): void {
	options = { ...options, ...input };
	flushSync(() => root.render(App, options));
}

export function target(): HTMLElement {
	return document.getElementById('layout-target')!;
}

export function snapshot() {
	const node = target();
	const box = node.getBoundingClientRect();
	return {
		left: box.left,
		top: box.top,
		width: box.width,
		height: box.height,
		scrollLeft: document.getElementById('layout-parent')!.scrollLeft,
		priority: node.style.getPropertyPriority('transform'),
		transform: node.style.transform,
	};
}

export async function nextFrame(): Promise<void> {
	await new Promise<void>((done) => requestAnimationFrame(() => done()));
}

export async function waitForLeftBetween(min: number, max: number): Promise<void> {
	while (true) {
		await nextFrame();
		const { left } = snapshot();
		if (left > min && left < max) return;
	}
}

export function nextCompletion(): Promise<void> {
	return new Promise((done) => {
		completed = done;
	});
}
