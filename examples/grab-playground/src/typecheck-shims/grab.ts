/** Typecheck stubs — runtime still resolves the real workspace package via Vite. */
export type ReactGrabAPI = {
	activate: () => void;
	deactivate: () => void;
	isActive: () => boolean;
	getState: () => Record<string, unknown>;
};

export function init(): ReactGrabAPI {
	return {
		activate() {},
		deactivate() {},
		isActive: () => false,
		getState: () => ({}),
	};
}

export function getGlobalApi(): ReactGrabAPI | null {
	return null;
}

export function formatElementInfo(_element: Element): unknown {
	return null;
}
