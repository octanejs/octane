// Ported from .base-ui/packages/react/src/internals/csp-context/CSPContext.tsx (v1.6.0).
// Carries the Content Security Policy configuration for components that need inline
// `<style>` tags — the `nonce` to stamp on them, and whether to skip them entirely.
import { createContext, useContext } from 'octane';

export interface CSPContextValue {
	nonce?: string | undefined;
	disableStyleElements?: boolean | undefined;
}

export const CSPContext = createContext<CSPContextValue | undefined>(undefined);

const DEFAULT_CSP_CONTEXT_VALUE: CSPContextValue = {
	disableStyleElements: false,
};

export function useCSPContext(...args: any[]): CSPContextValue {
	// `useContext` is slot-exempt in octane, so the caller's slot (if any) is ignored.
	void args;
	return useContext(CSPContext) ?? DEFAULT_CSP_CONTEXT_VALUE;
}
