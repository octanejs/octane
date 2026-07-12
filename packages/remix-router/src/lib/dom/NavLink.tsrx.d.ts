// Type declaration for the .tsrx component (resolved by relative path).
import type { To } from '../router/history';
import type { RelativeRoutingType } from '../router/router';

export type NavLinkRenderProps = {
	isActive: boolean;
	isPending: boolean;
	isTransitioning: boolean;
};

export declare const NavLink: (props: {
	to: To;
	children?: unknown | ((props: NavLinkRenderProps) => unknown);
	'aria-current'?: string;
	caseSensitive?: boolean;
	className?: string | ((props: NavLinkRenderProps) => string | undefined);
	end?: boolean;
	style?: object | ((props: NavLinkRenderProps) => object | undefined);
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
