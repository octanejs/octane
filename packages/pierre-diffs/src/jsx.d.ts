import type { DetailedHTMLProps, HTMLAttributes } from 'octane';

declare module 'octane/jsx-runtime' {
	namespace JSX {
		interface IntrinsicElements {
			// DIFFS_TAG_NAME from @pierre/diffs.
			'diffs-container': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
		}
	}
}
