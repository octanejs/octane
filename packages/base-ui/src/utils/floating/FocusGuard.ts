// Ported from .base-ui/packages/react/src/utils/FocusGuard.tsx. A visually-hidden, tabbable `<span>`
// the focus manager + portal place around the popup to catch tab-out. octane: `createElement`,
// ref-as-prop; `role="button"` only under VoiceOver+WebKit (inert in jsdom).
import { createElement, useState, useLayoutEffect } from 'octane';

import { S, subSlot } from '../../internal';
import { platform } from '../platform';
import { visuallyHidden } from '../visuallyHidden';

export function FocusGuard(props: any): any {
	const slot = S('FocusGuard');
	const { ref, ...rest } = props;
	const [role, setRole] = useState<'button' | undefined>(undefined, subSlot(slot, 'role'));

	useLayoutEffect(
		() => {
			if (platform.screenReader.voiceOver && platform.engine.webkit) {
				setRole('button');
			}
		},
		[],
		subSlot(slot, 'e'),
	);

	return createElement('span', {
		...rest,
		ref,
		style: visuallyHidden,
		'aria-hidden': role ? undefined : true,
		tabIndex: 0,
		role,
		['data-base-ui-focus-guard']: '',
	});
}
