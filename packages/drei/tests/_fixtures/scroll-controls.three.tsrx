/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeRef } from '@octanejs/three';
import * as THREE from 'three';
import { Scroll, ScrollControls, type ScrollControlsProps, type ScrollControlsState, useScroll } from '../../src/web/ScrollControls.three.tsrx';

function Capture({ onState }: { onState?: (state: ScrollControlsState) => void }) @{
	onState?.(useScroll());
}

export function ScrollControlsScene({ groupRef, htmlRef, onState, ...props }: Omit<ScrollControlsProps, 'children'> & {
	groupRef?: ThreeRef<THREE.Group>; htmlRef?: ThreeRef<HTMLDivElement>; onState?: (state: ScrollControlsState) => void;
}) @{
	<ScrollControls {...props}>
		<Capture onState={onState} />
		<Scroll ref={groupRef}><mesh name="scroll-child" /></Scroll>
		<Scroll html ref={htmlRef} style={{ color: 'red' }} />
	</ScrollControls>
}
