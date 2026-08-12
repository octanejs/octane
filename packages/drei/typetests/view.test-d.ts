import { View, type ContainerProps, type ViewportProps, type ViewProps } from '@octanejs/drei';
import * as THREE from 'three';

const props: ViewProps = {
	as: 'section',
	visible: true,
	index: 2,
	frames: 1,
	className: 'preview',
};
const viewport: ViewportProps = View;
const container: ContainerProps = {
	visible: true,
	scene: new THREE.Scene(),
	index: 1,
	frames: Infinity,
	rect: { current: null },
	canvasSize: { top: 0, left: 0, width: 100, height: 100 },
};
void [View, View.Port, props, viewport, container];

// @ts-expect-error frame count is numeric
const invalid: ViewProps = { frames: 'always' };
void invalid;
