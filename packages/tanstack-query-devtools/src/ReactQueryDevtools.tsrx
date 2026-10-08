// Ported from @tanstack/react-query-devtools 5.102.8
// (https://github.com/TanStack/query/blob/2969edf32f7e0c48e2a108d84712d6e01edfde21/packages/react-query-devtools/src/ReactQueryDevtools.tsx).
//
// Octane adaptations:
// - React hooks (useEffect/useRef/useState) come directly from octane.
// - `useQueryClient` and `onlineManager` come from @octanejs/tanstack-query.
// - The framework-agnostic `@tanstack/query-devtools` core is reused UNCHANGED.
// - The devtools instance is created in a lazy `useState` initializer, so re-renders do not
//   construct (and discard) a new core instance.
import { useEffect, useRef, useState } from 'octane';
import { onlineManager, useQueryClient } from '@octanejs/tanstack-query';
import { TanstackQueryDevtools } from '@tanstack/query-devtools';
import type {
	DevtoolsButtonPosition,
	DevtoolsErrorType,
	DevtoolsPosition,
	Theme,
} from '@tanstack/query-devtools';
import type { QueryClient } from '@octanejs/tanstack-query';
import type { OctaneNode } from 'octane';

export interface DevtoolsOptions {
	/**
	 * Set this true if you want the dev tools to default to being open
	 */
	initialIsOpen?: boolean;
	/**
	 * The position of the TanStack logo to open and close the devtools panel.
	 * 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'relative'
	 * Defaults to 'bottom-right'.
	 */
	buttonPosition?: DevtoolsButtonPosition;
	/**
	 * The position of the React Query devtools panel.
	 * 'top' | 'bottom' | 'left' | 'right'
	 * Defaults to 'bottom'.
	 */
	position?: DevtoolsPosition;
	/**
	 * Custom instance of QueryClient
	 */
	client?: QueryClient;
	/**
	 * Use this so you can define custom errors that can be shown in the devtools.
	 */
	errorTypes?: Array<DevtoolsErrorType>;
	/**
	 * Use this to pass a nonce to the style tag that is added to the document head. This is useful if you are using a Content Security Policy (CSP) nonce to allow inline styles.
	 */
	styleNonce?: string;
	/**
	 * Use this so you can attach the devtool's styles to specific element in the DOM.
	 */
	shadowDOMTarget?: ShadowRoot;
	/**
	 * Set this to true to hide disabled queries from the devtools panel.
	 */
	hideDisabledQueries?: boolean;
	/**
	 * Set this to 'light', 'dark', or 'system' to change the theme of the devtools panel.
	 * Defaults to 'system'.
	 */
	theme?: Theme;
}

export function ReactQueryDevtools(props: DevtoolsOptions): OctaneNode {
	const queryClient = useQueryClient(props.client);
	const ref = useRef<HTMLDivElement | null>(null);
	const {
		buttonPosition,
		position,
		initialIsOpen,
		errorTypes,
		styleNonce,
		shadowDOMTarget,
		hideDisabledQueries,
		theme,
	} = props;
	// OCTANE DIVERGENCE[lazy-core-construction][conformance:tanstack-query-devtools-constructs-the-core-once-across-re-renders-and-updates-it-in-place]: the core is built in a lazy initializer so re-renders reuse it.
	const [devtools] = useState(
		() =>
			new TanstackQueryDevtools({
				client: queryClient,
				queryFlavor: 'React Query',
				version: '5',
				onlineManager,
				buttonPosition,
				position,
				initialIsOpen,
				errorTypes,
				styleNonce,
				shadowDOMTarget,
				hideDisabledQueries,
				theme,
			}),
	);

	useEffect(() => {
		devtools.setClient(queryClient);
	}, [queryClient, devtools]);

	useEffect(() => {
		if (buttonPosition) {
			devtools.setButtonPosition(buttonPosition);
		}
	}, [buttonPosition, devtools]);

	useEffect(() => {
		if (position) {
			devtools.setPosition(position);
		}
	}, [position, devtools]);

	useEffect(() => {
		devtools.setInitialIsOpen(initialIsOpen || false);
	}, [initialIsOpen, devtools]);

	useEffect(() => {
		devtools.setErrorTypes(errorTypes || []);
	}, [errorTypes, devtools]);

	useEffect(() => {
		devtools.setTheme(theme);
	}, [theme, devtools]);

	useEffect(() => {
		if (ref.current) {
			devtools.mount(ref.current);
		}

		return () => {
			devtools.unmount();
		};
	}, [devtools]);

	return <div dir="ltr" class="tsqd-parent-container" ref={ref}></div>;
}
