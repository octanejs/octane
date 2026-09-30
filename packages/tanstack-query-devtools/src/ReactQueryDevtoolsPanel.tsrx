// Ported from @tanstack/react-query-devtools 5.102.8
// (https://github.com/TanStack/query/blob/2969edf32f7e0c48e2a108d84712d6e01edfde21/packages/react-query-devtools/src/ReactQueryDevtoolsPanel.tsx).
//
// Octane adaptations: see ReactQueryDevtools.tsrx.
import { useEffect, useRef, useState } from 'octane';
import { onlineManager, useQueryClient } from '@octanejs/tanstack-query';
import { TanstackQueryDevtoolsPanel } from '@tanstack/query-devtools';
import type { DevtoolsErrorType, Theme } from '@tanstack/query-devtools';
import type { QueryClient } from '@octanejs/tanstack-query';
import type { CSSProperties, OctaneNode } from 'octane';

export interface DevtoolsPanelOptions {
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
	 * Custom styles for the devtools panel
	 * @default { height: '500px' }
	 * @example { height: '100%' }
	 * @example { height: '100%', width: '100%' }
	 */
	style?: CSSProperties;

	/**
	 * Callback function that is called when the devtools panel is closed
	 */
	onClose?: () => unknown;
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

export function ReactQueryDevtoolsPanel(props: DevtoolsPanelOptions): OctaneNode {
	const queryClient = useQueryClient(props.client);
	const ref = useRef<HTMLDivElement | null>(null);
	const { errorTypes, styleNonce, shadowDOMTarget, hideDisabledQueries, theme } = props;
	// OCTANE DIVERGENCE[lazy-core-construction][conformance:tanstack-query-devtools-constructs-the-core-once-across-re-renders-and-updates-it-in-place]: the core is built in a lazy initializer so re-renders reuse it.
	const [devtools] = useState(
		() =>
			new TanstackQueryDevtoolsPanel({
				client: queryClient,
				queryFlavor: 'React Query',
				version: '5',
				onlineManager,
				buttonPosition: 'bottom-left',
				position: 'bottom',
				initialIsOpen: true,
				errorTypes,
				styleNonce,
				shadowDOMTarget,
				onClose: props.onClose,
				hideDisabledQueries,
				theme,
			}),
	);

	useEffect(() => {
		devtools.setClient(queryClient);
	}, [queryClient, devtools]);

	useEffect(() => {
		devtools.setOnClose(props.onClose ?? (() => {}));
	}, [props.onClose, devtools]);

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

	return (
		<div style={{ height: '500px', ...props.style }} class="tsqd-parent-container" ref={ref}></div>
	);
}
