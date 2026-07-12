// Type declaration for the .tsrx component (resolved by relative path).
import type { RelativeRoutingType } from '../router/router';

export declare const Form: (props: {
	children?: unknown;
	method?: 'get' | 'post' | 'put' | 'patch' | 'delete' | string;
	action?: string;
	encType?: 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain';
	navigate?: boolean;
	fetcherKey?: string;
	replace?: boolean;
	state?: any;
	relative?: RelativeRoutingType;
	preventScrollReset?: boolean;
	reloadDocument?: boolean;
	viewTransition?: boolean;
	defaultShouldRevalidate?: boolean;
	discover?: 'render' | 'none';
	onSubmit?: (event: SubmitEvent) => void;
	ref?: unknown;
	[key: string]: unknown;
}) => unknown;
