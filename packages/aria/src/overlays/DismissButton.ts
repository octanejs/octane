// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/DismissButton.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; the overlays intl dictionary is
// imported from the ported `../intl/overlays` index (upstream's Parcel glob); the plain-`.ts`
// component uses the S()/subSlot component-slot convention; React's `JSX.Element` → `any`;
// `onClick` is a native DOM click handler.
import type { AriaLabelingProps, DOMProps } from '@react-types/shared';
import { createElement } from 'octane';

import intlMessages from '../intl/overlays';
import { S, subSlot } from '../internal';
import { useLabels } from '../utils/useLabels';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { VisuallyHidden } from '../visually-hidden/VisuallyHidden';

export interface DismissButtonProps extends AriaLabelingProps, DOMProps {
	/** Called when the dismiss button is activated. */
	onDismiss?: () => void;
}

/**
 * A visually hidden button that can be used to allow screen reader
 * users to dismiss a modal or popup when there is no visual
 * affordance to do so.
 */
export function DismissButton(props: DismissButtonProps): any {
	const slot = S('DismissButton');
	let { onDismiss, ...otherProps } = props;
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/overlays',
		subSlot(slot, 'strings'),
	);

	let labels = useLabels(otherProps, stringFormatter.format('dismiss'), subSlot(slot, 'labels'));

	let onClick = () => {
		if (onDismiss) {
			onDismiss();
		}
	};

	return createElement(VisuallyHidden, {
		children: createElement('button', {
			...labels,
			tabIndex: -1,
			onClick,
			style: { width: 1, height: 1 },
		}),
	});
}
