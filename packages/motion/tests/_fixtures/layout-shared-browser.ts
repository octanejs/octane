import { createElement, createRoot, flushSync, type Root } from 'octane';
import { LayoutGroup, motion, MotionConfig } from '@octanejs/motion';

interface Options {
	name: string;
	key: string;
	groupId?: string;
	layoutId: string;
	layout?: 'position';
	left: number;
	width: number;
	transform?: string;
	reducedMotion?: 'always' | 'never';
}

const roots = new Map<string, { root: Root; options: Options; container: HTMLElement }>();
const completions = new Map<string, () => void>();

function App(props: Options) {
	const child = createElement(motion.div, {
		id: `shared-${props.name}`,
		key: props.key,
		layout: props.layout,
		layoutId: props.layoutId,
		transition: {
			duration: 0.05,
			ease: 'linear',
			onComplete: () => {
				const done = completions.get(props.name);
				completions.delete(props.name);
				done?.();
			},
		},
		style: {
			position: 'absolute',
			left: `${props.left}px`,
			top: '0px',
			width: `${props.width}px`,
			height: '100px',
			transform: props.transform,
			transformOrigin: '0 0',
		},
		children: props.name,
	});
	return createElement(MotionConfig, {
		reducedMotion: props.reducedMotion ?? 'never',
		children:
			props.groupId === undefined
				? child
				: createElement(LayoutGroup, { id: props.groupId, children: child }),
	});
}

export function mount(name: string, input: Partial<Options> = {}): void {
	const container = document.createElement('section');
	document.getElementById('main')!.appendChild(container);
	const root = createRoot(container);
	const options = { name, key: 'before', layoutId: 'hero', left: 0, width: 100, ...input };
	roots.set(name, { root, options, container });
	root.render(App, options);
	flushSync(() => {});
}

export function update(name: string, input: Partial<Options>): void {
	const entry = roots.get(name)!;
	entry.options = { ...entry.options, ...input };
	flushSync(() => entry.root.render(App, entry.options));
}

export function unmount(name: string): void {
	const entry = roots.get(name)!;
	entry.root.unmount();
	entry.container.remove();
	roots.delete(name);
}

export function node(name: string): HTMLElement {
	return document.getElementById(`shared-${name}`)!;
}

export function snapshot(name: string) {
	const target = node(name);
	const box = target.getBoundingClientRect();
	return {
		left: box.left,
		top: box.top,
		width: box.width,
		height: box.height,
		transform: target.style.transform,
	};
}

export function nextCompletion(name: string): Promise<void> {
	return new Promise((done) => completions.set(name, done));
}

export async function nextFrame(): Promise<void> {
	await new Promise<void>((done) => requestAnimationFrame(() => done()));
}
