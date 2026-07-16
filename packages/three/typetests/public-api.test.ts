import type { UniversalComponent } from 'octane/universal';
import {
	createRoot,
	useFrame,
	useStore,
	useThree,
	type CanvasProps,
	type Renderer,
	type RootState,
	type ThreeRoot,
} from '@octanejs/three';
import { createThreeTestRenderer, type ThreeTestRenderer } from '@octanejs/three/testing';

declare const canvas: HTMLCanvasElement;
declare const renderer: Renderer;
declare const Scene: UniversalComponent<{ name: string }>;

const root: ThreeRoot<HTMLCanvasElement> = createRoot(canvas);
const configured: Promise<ThreeRoot<HTMLCanvasElement>> = root.configure({
	gl: renderer,
	size: { width: 640, height: 360 },
	dpr: [1, 2],
	frameloop: 'demand',
});
const asyncConfigured: Promise<ThreeRoot<HTMLCanvasElement>> = root.configure({
	gl: async (defaults) => {
		const configuredCanvas: HTMLCanvasElement = defaults.canvas;
		void configuredCanvas;
		return renderer;
	},
});
root.render(Scene, { name: 'typed-scene' });

const canvasProps: CanvasProps = {
	gl: () => renderer,
	dpr: 1,
	frameloop: 'never',
	shadows: 'soft',
	style: { width: '100%', height: 320 },
};

function HookTypes(): void {
	const scene = useThree((state) => state.scene);
	const selectedWidth: number = useStore((state) => state.size.width);
	const wholeState: RootState = useThree();
	useFrame((state, delta, frame) => {
		const current: RootState = state;
		const seconds: number = delta;
		void current;
		void seconds;
		void frame;
	});
	void scene;
	void selectedWidth;
	void wholeState;
}

const testRenderer: Promise<ThreeTestRenderer> = createThreeTestRenderer(Scene, {
	name: 'test-scene',
});

// @ts-expect-error Frameloop accepts only the three supported scheduling modes.
root.configure({ gl: renderer, frameloop: 'sometimes' });

// @ts-expect-error A DPR range requires numeric lower and upper bounds.
root.configure({ gl: renderer, dpr: ['low', 'high'] });

void configured;
void asyncConfigured;
void canvasProps;
void HookTypes;
void testRenderer;
