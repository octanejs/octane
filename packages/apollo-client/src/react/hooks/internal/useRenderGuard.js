import * as React from 'octane';
export function useRenderGuard() {
	return React.useCallback(() => {
		try {
			// Unlike React, Octane context reads are valid outside a render. A
			// slot-keyed hook is the reliable render-phase probe: conditional
			// hooks are supported, and useRef throws when no component is active.
			React.useRef(null);
			return true;
		} catch {
			return false;
		}
	}, []);
}
