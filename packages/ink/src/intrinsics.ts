import type { UniversalRenderable } from 'octane/universal/native';
import type { Except } from 'type-fest';
import type { DOMElement } from './dom.js';
import type { Styles } from './styles.js';

export interface InkBoxIntrinsic {
	internal_static?: boolean;
	children?: UniversalRenderable;
	key?: string | number | bigint;
	ref?: ((value: DOMElement | null) => void) | { current: DOMElement | null } | null;
	style?: Except<Styles, 'textWrap'>;
	internal_accessibility?: DOMElement['internal_accessibility'];
}

export interface InkTextIntrinsic {
	children?: UniversalRenderable;
	key?: string | number | bigint;
	style?: Styles;
	internal_transform?: (children: string, index: number) => string;
	internal_accessibility?: DOMElement['internal_accessibility'];
}

export namespace JSX {
	export type Element = UniversalRenderable;
	export interface IntrinsicAttributes {
		key?: string | number | bigint;
	}
	export interface IntrinsicElements {
		'ink-root': { children?: UniversalRenderable };
		'ink-box': InkBoxIntrinsic;
		'ink-text': InkTextIntrinsic;
		'ink-virtual-text': InkTextIntrinsic;
	}
}
