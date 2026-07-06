// Ported from .base-ui/packages/react/src/utils/InternalBackdrop.tsx. The always-present backdrop a
// modal popup renders so Floating UI's outside-press detection sees an element that existed when the
// popup opened. octane: `createElement`; ref-as-prop.
import { createElement } from 'octane';

export function InternalBackdrop(props: any): any {
	const { cutout, ref, ...otherProps } = props;

	let clipPath: string | undefined;
	if (cutout) {
		const rect = cutout.getBoundingClientRect();
		clipPath = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`;
	}

	return createElement('div', {
		ref,
		role: 'presentation',
		['data-base-ui-inert']: '',
		...otherProps,
		style: {
			position: 'fixed',
			inset: 0,
			userSelect: 'none',
			WebkitUserSelect: 'none',
			clipPath,
		},
	});
}
