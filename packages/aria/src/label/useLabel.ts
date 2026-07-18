// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/label/useLabel.ts).
// octane adaptations: React's ElementType/LabelHTMLAttributes → local structural types;
// the dev-only missing-label console.warn is not ported (repo policy).
import type {
	AriaLabelingProps,
	DOMAttributes,
	DOMProps,
	LabelableProps,
} from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { useId } from '../utils/useId';
import { useLabels } from '../utils/useLabels';

export interface LabelAriaProps extends LabelableProps, DOMProps, AriaLabelingProps {
	/**
	 * The HTML element used to render the label, e.g. 'label', or 'span'.
	 *
	 * @default 'label'
	 */
	labelElementType?: string;
}

export interface LabelAria {
	/** Props to apply to the label container element. */
	labelProps: DOMAttributes & { htmlFor?: string };
	/** Props to apply to the field container element being labeled. */
	fieldProps: AriaLabelingProps & DOMProps;
}

/**
 * Provides the accessibility implementation for labels and their associated elements.
 * Labels provide context for user inputs.
 *
 * @param props - The props for labels and fields.
 */
export function useLabel(props: LabelAriaProps): LabelAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useLabel(props: LabelAriaProps, slot: symbol | undefined): LabelAria;
export function useLabel(...args: any[]): LabelAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLabel');
	const props = user[0] as LabelAriaProps;

	let {
		id,
		label,
		'aria-labelledby': ariaLabelledby,
		'aria-label': ariaLabel,
		labelElementType = 'label',
	} = props;

	id = useId(id, subSlot(slot, 'id'));
	let labelId = useId(subSlot(slot, 'labelId'));
	let labelProps = {};
	if (label) {
		ariaLabelledby = ariaLabelledby ? `${labelId} ${ariaLabelledby}` : labelId;
		labelProps = {
			id: labelId,
			htmlFor: labelElementType === 'label' ? id : undefined,
		};
	}

	let fieldProps = useLabels(
		{
			id,
			'aria-label': ariaLabel,
			'aria-labelledby': ariaLabelledby,
		},
		undefined,
		subSlot(slot, 'fieldProps'),
	);

	return {
		labelProps,
		fieldProps,
	};
}
