// Type declaration for the .tsrx component (resolved by relative path).
import type { To } from '../router/history';
import type { RelativeRoutingType } from '../router/router';

export declare const Link: (props: {
	to: To;
	children?: unknown;
	onClick?: (event: MouseEvent) => void;
	discover?: 'render' | 'none';
	prefetch?: 'none' | 'intent' | 'render' | 'viewport';
	relative?: RelativeRoutingType;
	reloadDocument?: boolean;
	replace?: boolean;
	mask?: To;
	state?: any;
	target?: string;
	preventScrollReset?: boolean;
	viewTransition?: boolean;
	defaultShouldRevalidate?: boolean;
	ref?: unknown;
	[key: string]: unknown;
}) => unknown;
