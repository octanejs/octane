// CSS Anchor Positioning API types
// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning

import 'react';

declare module 'react' {
	interface CSSProperties {
		anchorName?: string;
		positionAnchor?: string;
	}
}

declare global {
	interface CSSStyleDeclaration {
		anchorName: string;
		positionAnchor: string;
	}
}

export {};
