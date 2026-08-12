// Behavioral Octane port of @react-spring/parallax v10.1.2.
import { raf } from '@react-spring/rafz';
import { createContext, useContext, useImperativeHandle, useLayoutEffect, useState } from 'octane';
import { config as configs, Controller, type SpringConfig } from './engine';

type ConfigProp = SpringConfig | ((key: string) => SpringConfig);
type RefObject<T> = { current: T | null };

export interface StickyConfig {
	start?: number;
	end?: number;
}

export interface IParallaxLayer {
	horizontal: boolean;
	sticky?: StickyConfig;
	isSticky: boolean;
	setHeight(height: number, immediate?: boolean): void;
	setPosition(height: number, scroll: number, immediate?: boolean): void;
	stop(): void;
}

export interface IParallax {
	config: ConfigProp;
	horizontal: boolean;
	busy: boolean;
	space: number;
	offset: number;
	current: number;
	controller: Controller<{ scroll: number }>;
	layers: Set<IParallaxLayer>;
	container: RefObject<HTMLDivElement>;
	content: RefObject<HTMLDivElement>;
	scrollTo(offset: number): void;
	update(): void;
	stop(): void;
}

export interface ParallaxProps {
	pages: number;
	config?: ConfigProp;
	horizontal?: boolean;
	enabled?: boolean;
	innerStyle?: Record<string, unknown>;
	ref?: RefObject<IParallax> | ((value: IParallax | null) => void);
	style?: Record<string, unknown>;
	children?: unknown;
	[key: string]: unknown;
}

export interface ParallaxLayerProps {
	horizontal?: boolean;
	offset?: number;
	speed?: number;
	factor?: number;
	sticky?: StickyConfig;
	ref?: RefObject<IParallaxLayer> | ((value: IParallaxLayer | null) => void);
	style?: Record<string, unknown>;
	children?: unknown;
	[key: string]: unknown;
}

interface ParallaxState extends IParallax {
	enabled: boolean;
	pages: number;
}

interface ParallaxLayerState extends IParallaxLayer {
	factor: number;
	offset: number;
	speed: number;
}

const ParallaxContext = createContext<IParallax | null>(null);
const START_TRANSLATE_3D = 'translate3d(0px,0px,0px)';

function scrollProperty(horizontal: boolean): 'scrollLeft' | 'scrollTop' {
	return horizontal ? 'scrollLeft' : 'scrollTop';
}

function updateLayerNode(
	node: HTMLElement,
	horizontal: boolean,
	space: number,
	translate: number,
): void {
	node.style[horizontal ? 'width' : 'height'] = `${space}px`;
	node.style[horizontal ? 'height' : 'width'] = '100%';
	node.style.transform = horizontal
		? `translate3d(${translate}px,0,0)`
		: `translate3d(0,${translate}px,0)`;
}

export function Parallax(props: any) @{
	const {
		pages,
		config = configs.slow,
		enabled = true,
		horizontal = false,
		innerStyle,
		children,
		ref: givenRef,
		style,
		...rest
	} = props;
	const [container] = useState<RefObject<HTMLDivElement>>(() => ({ current: null }));
	const [content] = useState<RefObject<HTMLDivElement>>(() => ({ current: null }));
	const [state] = useState<ParallaxState>(() => {
		const controller = new Controller<{ scroll: number }>({ from: { scroll: 0 } });
		const parallax: ParallaxState = {
			config,
			horizontal,
			enabled,
			pages,
			busy: false,
			space: 0,
			offset: 0,
			current: 0,
			controller,
			layers: new Set(),
			container,
			content,
			update() {
				const node = container.current;
				if (node === null) return;
				parallax.space = parallax.horizontal ? node.clientWidth : node.clientHeight;
				const scroll = scrollProperty(parallax.horizontal);
				if (parallax.enabled) parallax.current = node[scroll];
				else node[scroll] = parallax.current = parallax.offset * parallax.space;
				if (content.current !== null) {
					content.current.style[parallax.horizontal ? 'width' : 'height'] = `${
						parallax.space * parallax.pages
					}px`;
				}
				for (const layer of parallax.layers) {
					layer.setHeight(parallax.space, true);
					layer.setPosition(parallax.space, parallax.current, true);
				}
			},
			scrollTo(offset: number) {
				const node = container.current;
				if (node === null || !parallax.enabled) return;
				parallax.offset = offset;
				const scroll = scrollProperty(parallax.horizontal);
				controller.set({ scroll: parallax.current });
				controller.stop().start({
					to: { scroll: offset * parallax.space },
					config: parallax.config,
					onChange(result) {
						const value = result.value.scroll;
						node[scroll] = value;
						parallax.current = value;
						for (const layer of parallax.layers) layer.setPosition(parallax.space, value, true);
					},
				});
			},
			stop() {
				controller.stop();
				parallax.busy = false;
			},
		};
		return parallax;
	});
	state.config = config;
	state.horizontal = horizontal;
	state.enabled = enabled;
	state.pages = pages;
	useImperativeHandle(givenRef, () => state, []);

	useLayoutEffect(() => {
		const node = container.current;
		if (node === null) return;
		let live = true;
		const onScroll = () => {
			if (!enabled || state.busy) return;
			state.busy = true;
			state.current = node[scrollProperty(state.horizontal)];
			raf.onStart(() => {
				if (!live) return;
				for (const layer of state.layers) layer.setPosition(state.space, state.current);
				state.busy = false;
			});
		};
		const onResize = () => state.update();
		state.update();
		node.addEventListener('scroll', onScroll, { passive: true });
		const observer =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
		observer?.observe(node);
		return () => {
			live = false;
			node.removeEventListener('scroll', onScroll);
			observer?.disconnect();
			state.stop();
			for (const layer of state.layers) layer.stop();
		};
	}, [horizontal, enabled, pages]);

	<div
		{...rest}
		ref={container}
		onWheel={enabled ? state.stop : undefined}
		onTouchStart={enabled ? state.stop : undefined}
		style={{
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			overflowY: enabled && !horizontal ? 'scroll' : 'hidden',
			overflowX: enabled && horizontal ? 'scroll' : 'hidden',
			WebkitOverflowScrolling: 'touch',
			transform: START_TRANSLATE_3D,
			...style,
		}}
	>
		<div
			ref={content}
			style={{
				overflow: 'hidden',
				position: 'absolute',
				width: horizontal ? `${state.space * pages}px` : '100%',
				height: horizontal ? '100%' : `${state.space * pages}px`,
				transform: START_TRANSLATE_3D,
				...innerStyle,
			}}
		>
			<ParallaxContext value={state}>{children}</ParallaxContext>
		</div>
	</div>
}

export function ParallaxLayer(props: any) @{
	const {
		horizontal: layerHorizontal,
		factor = 1,
		offset = 0,
		speed = 0,
		sticky,
		ref: givenRef,
		style,
		children,
		...rest
	} = props;
	const parent = useContext(ParallaxContext);
	if (parent === null) throw new Error('ParallaxLayer must be rendered inside Parallax');
	const [node] = useState<RefObject<HTMLDivElement>>(() => ({ current: null }));
	const [layer] = useState<ParallaxLayerState>(
		() => ({
			horizontal: layerHorizontal === undefined || sticky ? parent.horizontal : layerHorizontal,
			factor,
			offset,
			speed,
			sticky: sticky === undefined
				? undefined
				: { start: sticky.start ?? 0, end: sticky.end ?? (sticky.start ?? 0) + 1 },
			isSticky: false,
			setHeight(height) {
				if (node.current === null) return;
				const size = layer.sticky ? height : height * layer.factor;
				node.current.style[layer.horizontal ? 'width' : 'height'] = `${size}px`;
			},
			setPosition(height, scroll) {
				const element = node.current;
				if (element === null) return;
				let translate: number;
				if (layer.sticky) {
					const start = (layer.sticky.start ?? 0) * height;
					const end = (layer.sticky.end ?? layer.sticky.start ?? 0) * height;
					layer.isSticky = scroll >= start && scroll <= end;
					element.style.position = layer.isSticky ? 'sticky' : 'absolute';
					translate = layer.isSticky ? 0 : scroll < start ? start : end;
				} else {
					const targetScroll = Math.floor(layer.offset) * height;
					translate = -(scroll * layer.speed) + height * layer.offset + targetScroll * layer.speed;
				}
				updateLayerNode(
					element,
					layer.horizontal,
					layer.sticky ? height : height * layer.factor,
					translate,
				);
			},
			stop() {},
		}),
	);
	layer.horizontal = layerHorizontal === undefined || sticky ? parent.horizontal : layerHorizontal;
	layer.factor = factor;
	layer.offset = offset;
	layer.speed = speed;
	layer.sticky = sticky === undefined
		? undefined
		: { start: sticky.start ?? 0, end: sticky.end ?? (sticky.start ?? 0) + 1 };
	useImperativeHandle(givenRef, () => layer, []);
	useLayoutEffect(() => {
		parent.layers.add(layer);
		parent.update();
		return () => {
			parent.layers.delete(layer);
			layer.stop();
			parent.update();
		};
	}, [parent, offset, speed, factor, sticky?.start, sticky?.end, layerHorizontal]);

	<div
		{...rest}
		ref={node}
		style={{
			position: 'absolute',
			top: 0,
			bottom: 0,
			left: 0,
			right: 0,
			backgroundSize: 'auto',
			backgroundRepeat: 'no-repeat',
			willChange: 'transform',
			transform: START_TRANSLATE_3D,
			...style,
		}}
	>{children}</div>
}
