/** @jsxImportSource @octanejs/three/intrinsics */
import { type DomEvent, type RootState, type ThreeRef, useFrame, useStore, useThree } from '@octanejs/three';
import { type RefObject, useEffect, useImperativeHandle, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import { easing } from 'maath';
import * as THREE from 'three';
import { mountScrollHtml, setScrollControlsStateProvider } from './scroll-html-root.tsrx';

export type ScrollControlsProps = {
	eps?: number; horizontal?: boolean; infinite?: boolean; pages?: number; distance?: number;
	damping?: number; maxSpeed?: number; prepend?: boolean; enabled?: boolean;
	style?: Partial<CSSStyleDeclaration>; children: OctaneNode;
};

export type ScrollControlsState = {
	el: HTMLDivElement; eps: number; fill: HTMLDivElement; fixed: HTMLDivElement;
	horizontal: boolean | undefined; damping: number; offset: number; delta: number; pages: number;
	range(from: number, distance: number, margin?: number): number;
	curve(from: number, distance: number, margin?: number): number;
	visible(from: number, distance: number, margin?: number): boolean;
};

const context = createContext<ScrollControlsState>(null as unknown as ScrollControlsState);
setScrollControlsStateProvider(context.Provider);
export function useScroll(): ScrollControlsState { return useContext(context); }

export function ScrollControls({ eps = 0.00001, enabled = true, infinite, horizontal, pages = 1,
	distance = 1, damping = 0.25, maxSpeed = Infinity, prepend = false, style = {}, children }: ScrollControlsProps) @{
	const rootState = useThree();
	const { get, setEvents, gl, size, invalidate, events } = rootState;
	const [el] = useState(() => document.createElement('div'));
	const [fill] = useState(() => document.createElement('div'));
	const [fixed] = useState(() => document.createElement('div'));
	const target = (gl as unknown as THREE.WebGLRenderer).domElement.parentNode as HTMLElement;
	const scroll = useRef(0);
	const state = useMemo<ScrollControlsState & { scroll: RefObject<number> }>(() => ({
		el, eps, fill, fixed, horizontal, damping, offset: 0, delta: 0, scroll, pages,
		range(from, rangeDistance, margin = 0) { const start = from - margin; const end = start + rangeDistance + margin * 2; return this.offset < start ? 0 : this.offset > end ? 1 : (this.offset - start) / (end - start); },
		curve(from, rangeDistance, margin = 0) { return Math.sin(this.range(from, rangeDistance, margin) * Math.PI); },
		visible(from, rangeDistance, margin = 0) { const start = from - margin; const end = start + rangeDistance + margin * 2; return this.offset >= start && this.offset <= end; },
	}), [eps, damping, horizontal, pages]);

	useEffect(() => {
		el.style.position = 'absolute'; el.style.width = '100%'; el.style.height = '100%';
		el.style[horizontal ? 'overflowX' : 'overflowY'] = 'auto';
		el.style[horizontal ? 'overflowY' : 'overflowX'] = 'hidden';
		el.style.top = '0px'; el.style.left = '0px';
		for (const key in style) (el.style as any)[key] = (style as any)[key];
		fixed.style.position = 'sticky'; fixed.style.top = '0px'; fixed.style.left = '0px';
		fixed.style.width = '100%'; fixed.style.height = '100%'; fixed.style.overflow = 'hidden'; el.appendChild(fixed);
		fill.style.height = horizontal ? '100%' : `${pages * distance * 100}%`;
		fill.style.width = horizontal ? `${pages * distance * 100}%` : '100%'; fill.style.pointerEvents = 'none'; el.appendChild(fill);
		if (prepend) target.prepend(el); else target.appendChild(el);
		el[horizontal ? 'scrollLeft' : 'scrollTop'] = 1;
		const oldTarget = (events.connected || (gl as unknown as THREE.WebGLRenderer).domElement) as HTMLElement;
		requestAnimationFrame(() => events.connect?.(el));
		const oldCompute = get().events.compute;
		setEvents({ compute(event: DomEvent, current: RootState) {
			const { left, top } = target.getBoundingClientRect();
			current.pointer.set(((event.clientX - left) / current.size.width) * 2 - 1, -((event.clientY - top) / current.size.height) * 2 + 1);
			current.raycaster.setFromCamera(current.pointer, current.camera);
		} });
		return () => { target.removeChild(el); setEvents({ compute: oldCompute }); events.connect?.(oldTarget); };
	}, [pages, distance, horizontal, el, fill, fixed, target]);

	useEffect(() => {
		if (events.connected !== el) return;
		const containerLength = size[horizontal ? 'width' : 'height'];
		const scrollLength = el[horizontal ? 'scrollWidth' : 'scrollHeight'];
		const threshold = scrollLength - containerLength;
		let disableScroll = true; let firstRun = true;
		const onScroll = () => {
			if (!enabled || firstRun) return;
			invalidate(); const current = el[horizontal ? 'scrollLeft' : 'scrollTop']; scroll.current = current / threshold;
			if (infinite) {
				if (!disableScroll) {
					if (current >= threshold) { const damp = 1 - state.offset; el[horizontal ? 'scrollLeft' : 'scrollTop'] = 1; scroll.current = state.offset = -damp; disableScroll = true; }
					else if (current <= 0) { const damp = 1 + state.offset; el[horizontal ? 'scrollLeft' : 'scrollTop'] = scrollLength; scroll.current = state.offset = damp; disableScroll = true; }
				}
				if (disableScroll) setTimeout(() => (disableScroll = false), 40);
			}
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		requestAnimationFrame(() => (firstRun = false));
		const onWheel = (event: WheelEvent) => { el.scrollLeft += event.deltaY / 2; };
		if (horizontal) el.addEventListener('wheel', onWheel, { passive: true });
		return () => { el.removeEventListener('scroll', onScroll); if (horizontal) el.removeEventListener('wheel', onWheel); };
	}, [el, events, size, infinite, state, invalidate, horizontal, enabled]);

	let last = 0;
	useFrame((_, delta) => { last = state.offset; easing.damp(state, 'offset', scroll.current, damping, delta, maxSpeed, undefined, eps); easing.damp(state, 'delta', Math.abs(last - state.offset), damping, delta, maxSpeed, undefined, eps); if (state.delta > eps) invalidate(); });
	<context.Provider value={state}>{children}</context.Provider>
}

export type ScrollProps = { children?: OctaneNode; html?: false; style?: never } | { children?: OctaneNode; html: true; style?: Partial<CSSStyleDeclaration>; [key: string]: unknown };

function ScrollCanvas({ children, ref }: ScrollProps & { ref?: ThreeRef<THREE.Group> }) @{
	const group = useRef<THREE.Group | null>(null); useImperativeHandle((ref ?? null) as any, () => group.current!, []);
	const state = useScroll(); const { width, height } = useThree((value) => value.viewport);
	useFrame(() => { if (group.current) { group.current.position.x = state.horizontal ? -width * (state.pages - 1) * state.offset : 0; group.current.position.y = state.horizontal ? 0 : height * (state.pages - 1) * state.offset; } });
	<group ref={group}>{children}</group>
}

function ScrollHtml({ children, style, ref, ...props }: Extract<ScrollProps, { html: true }> & { ref?: ThreeRef<HTMLDivElement> }) @{
	const state = useScroll(); const [group] = useState(() => document.createElement('div')); const fiberState = useStore();
	const { width, height } = useThree((value) => value.size);
	useImperativeHandle((ref ?? null) as any, () => group, [group]);
	useEffect(() => {
		Object.assign(group.style, style, { position: 'absolute', top: '0px', left: '0px', willChange: 'transform' });
		for (const [key, value] of Object.entries(props)) if (value != null) group.setAttribute(key, String(value));
		state.fixed.appendChild(group);
		const unmount = mountScrollHtml(group, { state, fiberState, children });
		return () => { unmount(); group.remove(); };
	}, [state.fixed]);
	useFrame(() => { if (state.delta > state.eps) group.style.transform = `translate3d(${state.horizontal ? -width * (state.pages - 1) * state.offset : 0}px,${state.horizontal ? 0 : height * (state.pages - 1) * -state.offset}px,0)`; });
}

export function Scroll({ html, ref, ...props }: ScrollProps & { ref?: ThreeRef<THREE.Group & HTMLDivElement> }) @{
	<>{html ? <ScrollHtml ref={ref as any} {...props as any} /> : <ScrollCanvas ref={ref as any} {...props as any} />}</>
}
