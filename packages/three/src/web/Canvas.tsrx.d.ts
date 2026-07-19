import type { OctaneNode } from 'octane';
import type { RendererRegion } from 'octane/universal';
import type { RenderProps } from '../core/root.js';
import type { ResizeOptions } from './measure.js';

export type CanvasStyle = Readonly<Record<string, string | number | null | undefined>>;
export type CanvasRef =
	| { current: HTMLCanvasElement | null }
	| ((canvas: HTMLCanvasElement | null) => void | (() => void))
	| readonly CanvasRef[]
	| null;

export interface CanvasProps
	extends Omit<RenderProps<HTMLCanvasElement>, 'size'>, Record<string, unknown> {
	children?: RendererRegion | OctaneNode;
	fallback?: unknown;
	resize?: ResizeOptions;
	eventSource?: HTMLElement | { current: HTMLElement | null };
	eventPrefix?: 'offset' | 'client' | 'page' | 'layer' | 'screen';
	ref?: CanvasRef;
	style?: CanvasStyle;
}

export declare function Canvas(props: CanvasProps): unknown;
