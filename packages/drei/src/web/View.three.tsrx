/** @jsxImportSource @octanejs/three/intrinsics */
import { context as threeContext, createPortal, type RootState, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from '@octanejs/three/renderer';
import { type OctaneNode, useContext } from 'octane';
import * as THREE from 'three';

type CanvasSize = { top: number; left: number; height: number; width: number };
export type ContainerProps = { visible: boolean; scene: THREE.Scene; index: number; children?: OctaneNode; frames: number; rect: { current: DOMRect | null }; track?: { current: HTMLElement | null }; canvasSize: CanvasSize };
export type ViewProps = { as?: string; id?: string; className?: string; style?: Record<string, unknown>; visible?: boolean; index?: number; frames?: number; children?: OctaneNode; track?: { current: HTMLElement | null }; [key: string]: unknown };
export type ViewportProps = {
	(props: ViewProps & { ref?: ThreeRef<HTMLElement | THREE.Group> }): any;
	Port: typeof ViewPort;
};

const col = new THREE.Color();
function position(canvasSize: CanvasSize, rect: DOMRect) { const canvasBottom = canvasSize.top + canvasSize.height; return { position: { width: rect.width, height: rect.height, left: rect.left - canvasSize.left, top: rect.top, bottom: canvasBottom - rect.bottom, right: rect.right }, isOffscreen: rect.bottom < 0 || rect.top > canvasSize.height || rect.right < 0 || rect.left > canvasSize.width }; }
function prepare(state: RootState, value: ReturnType<typeof position>['position']) { const gl = state.gl as any; const aspect = value.width / value.height; const camera = state.camera as any; if (camera.isOrthographicCamera) { if (!camera.manual) Object.assign(camera, { left: value.width / -2, right: value.width / 2, top: value.height / 2, bottom: value.height / -2 }); camera.updateProjectionMatrix(); } else if (camera.aspect !== aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); } const autoClear = gl.autoClear; gl.autoClear = false; gl.setViewport(value.left, value.bottom, value.width, value.height); gl.setScissor(value.left, value.bottom, value.width, value.height); gl.setScissorTest(true); return autoClear; }
function finish(state: RootState, autoClear: boolean) { const gl = state.gl as any; gl.setScissorTest(false); gl.autoClear = autoClear; }
function clear(state: RootState) { const gl = state.gl as any; gl.getClearColor(col); gl.setClearColor(col, gl.getClearAlpha()); gl.clear(true, true); }

function Container({ visible = true, canvasSize, scene, index, children, frames, rect, track }: ContainerProps) @{
	const root = useThree(); const [offscreen, setOffscreen] = useState(false); let count = 0;
	useFrame((state) => { if (frames === Infinity || count <= frames) { if (track) rect.current = track.current?.getBoundingClientRect() ?? null; count++; } if (rect.current) { const result = position(canvasSize, rect.current); if (offscreen !== result.isOffscreen) setOffscreen(result.isOffscreen); if (visible && !offscreen) { const old = prepare(state, result.position); (state.gl as any).render(children ? state.scene : scene, state.camera); finish(state, old); } } }, index);
	useLayoutEffect(() => { if (rect.current && (!visible || !offscreen)) { const old = prepare(root, position(canvasSize, rect.current).position); clear(root); finish(root, old); } }, [visible, offscreen]);
	useEffect(() => { if (!track) return; const currentRect = rect.current; const old = root.get().events.connected; root.setEvents({ connected: track.current }); return () => { if (currentRect) { const auto = prepare(root, position(canvasSize, currentRect).position); clear(root); finish(root, auto); } root.setEvents({ connected: old }); }; }, [track]);
	<>{children}<group onPointerOver={() => null} /></>
}

function CanvasView({ track, visible = true, index = 1, frames = Infinity, children, ref, ...props }: ViewProps & { ref?: ThreeRef<THREE.Group> }) @{
	const rect = useRef<DOMRect | null>(null); const { size, scene } = useThree(); const [virtualScene] = useState(() => new THREE.Scene()); const [ready, setReady] = useState(false);
	const compute = useCallback((event: any, state: RootState) => { if (rect.current && track?.current && event.target === track.current) { const x = event.clientX - rect.current.left; const y = event.clientY - rect.current.top; state.pointer.set((x / rect.current.width) * 2 - 1, -(y / rect.current.height) * 2 + 1); state.raycaster.setFromCamera(state.pointer, state.camera); } }, [rect, track]);
	useEffect(() => { if (track) rect.current = track.current?.getBoundingClientRect() ?? null; setReady(true); }, [track]);
	<group ref={ref as any} {...props as any}>{ready && createPortal(<Container visible={visible} canvasSize={size} frames={frames} scene={scene} track={track} rect={rect} index={index}>{children}</Container>, virtualScene, { events: { compute, priority: index }, size: { width: rect.current?.width ?? size.width, height: rect.current?.height ?? size.height, top: rect.current?.top ?? size.top, left: rect.current?.left ?? size.left } })}</group>
}

function ViewComponent(props: ViewProps & { ref?: ThreeRef<HTMLElement | THREE.Group> }) @{
	useContext(threeContext);
	<CanvasView {...props as any} />
}

// OCTANE DIVERGENCE[view-renderer-boundary][ordinary:view-renderer-boundary]
export function ViewPort() @{
	<></>
}
export const View = ViewComponent as ViewportProps;
View.Port = ViewPort;
