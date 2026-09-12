// These fixture-only tags exercise foreign-content and custom-element mounts.
// Octane's public intrinsic table intentionally covers the React-shaped tags.
import 'octane/jsx-runtime';

declare module 'octane/jsx-runtime' {
	export namespace JSX {
		interface IntrinsicElements {
			math: { id?: string; children?: unknown };
			mn: { children?: unknown };
			mo: { children?: unknown };
			'octane-probe': { 'data-name'?: string; children?: unknown };
		}
	}
}
