/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeRef } from '@octanejs/three';
import * as THREE from 'three';
import { View, type ViewProps } from '../../src/web/View.three.tsrx';
import { ViewConnectedProbe } from './view-connected-probe.three.tsrx';

export function ViewScene({
	viewRef,
	onConnectedState,
	...props
}: ViewProps & {
	viewRef?: ThreeRef<THREE.Group>;
	onConnectedState?: (state: {
		events: { connected: unknown };
		setEvents: (value: unknown) => void;
	}) => void;
}) @{
	<View {...props} ref={viewRef}>
		<mesh name="view-child" />
		@if (onConnectedState) {
			<ViewConnectedProbe onState={onConnectedState} />
		}
	</View>
}

export function ViewPortScene() @{
	<View.Port />
}
