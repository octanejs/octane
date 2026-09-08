import type { OctaneNode } from 'octane';
import type { JSX } from 'octane/jsx-runtime';

export interface IContentLoaderProps extends Omit<
	JSX.IntrinsicElements['svg'],
	'children' | 'title' | 'style'
> {
	animate?: boolean;
	backgroundColor?: string;
	backgroundOpacity?: number;
	baseUrl?: string;
	foregroundColor?: string;
	foregroundOpacity?: number;
	gradientRatio?: number;
	rtl?: boolean;
	speed?: number;
	title?: string;
	uniqueKey?: string;
	beforeMask?: OctaneNode;
	children?: OctaneNode;
	style?: Record<string, string | number>;
}
