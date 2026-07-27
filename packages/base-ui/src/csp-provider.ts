// Ported from .base-ui/packages/react/src/csp-provider/CSPProvider.tsx (v1.6.0). Provides a
// default Content Security Policy configuration for Base UI components that require inline
// `<style>` or `<script>` tags.
import { createElement, useMemo } from 'octane';

import { S, subSlot } from './internal';
import { CSPContext } from './utils/CSPContext';
import type { CSPContextValue } from './utils/CSPContext';

export interface CSPProviderProps {
	children?: any;
	/** The nonce value to apply to inline `<style>` and `<script>` tags. */
	nonce?: string;
	/**
	 * Whether inline `<style>` elements created by Base UI components should not be rendered.
	 * Instead, components must specify the CSS styles via custom class names or other methods.
	 * @default false
	 */
	disableStyleElements?: boolean;
}

export function CSPProvider(props: CSPProviderProps): any {
	const slot = S('CSPProvider');
	const { children, nonce, disableStyleElements } = props;

	const contextValue: CSPContextValue = useMemo(
		() => ({ nonce, disableStyleElements }),
		[nonce, disableStyleElements],
		subSlot(slot, 'ctx'),
	);

	return createElement(CSPContext.Provider, { value: contextValue, children });
}

export namespace CSPProvider {
	export type Props = CSPProviderProps;
}
