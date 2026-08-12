declare module 'troika-three-text' {
	import { Mesh } from 'three';

	export class Text extends Mesh {
		font?: string;
		text: string;
		anchorX: number | string;
		anchorY: number | string;
		fontSize: number;
		sdfGlyphSize: number;
		sync(callback?: () => void): void;
		dispose(): void;
	}

	export function preloadFont(
		options: { font?: string; characters?: string },
		callback: () => void,
	): void;
}
