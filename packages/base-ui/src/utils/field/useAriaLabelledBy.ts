// Ported from .base-ui/packages/react/src/internals/labelable-provider/useAriaLabelledBy.ts.
// Resolves a control's `aria-labelledby`: an explicit value, else the Field label id, else a
// fallback discovered from a wrapping/sibling native <label>. The effect runs after every
// commit so DOM label association changes are reflected.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useBaseUiId } from '../useBaseUiId';

type LabelSource = HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null };

export function useAriaLabelledBy(...args: any[]): string | undefined {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useAriaLabelledBy');
	const explicitAriaLabelledBy = user[0] as string | undefined;
	const labelId = user[1] as string | undefined;
	const labelSourceRef = user[2] as { current: LabelSource | null };
	const enableFallback = (user[3] as boolean | undefined) ?? true;
	const labelSourceId = user[4] as string | undefined;

	const [fallbackAriaLabelledBy, setFallbackAriaLabelledBy] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'fb'),
	);

	const generatedLabelId = useBaseUiId(
		labelSourceId ? `${labelSourceId}-label` : undefined,
		subSlot(slot, 'gen'),
	);
	const ariaLabelledBy = explicitAriaLabelledBy ?? labelId ?? fallbackAriaLabelledBy;

	// No deps → runs after every commit (DOM label association can change without prop/state
	// deps changing).
	useLayoutEffect(
		() => {
			const nextAriaLabelledBy =
				explicitAriaLabelledBy || labelId || !enableFallback
					? undefined
					: getAriaLabelledBy(labelSourceRef.current, generatedLabelId);
			if (fallbackAriaLabelledBy !== nextAriaLabelledBy) {
				setFallbackAriaLabelledBy(nextAriaLabelledBy);
			}
		},
		undefined,
		subSlot(slot, 'e:fallback'),
	);

	return ariaLabelledBy;
}

function getAriaLabelledBy(
	labelSource: LabelSource | null | undefined,
	generatedLabelId: string | undefined,
): string | undefined {
	const label = findAssociatedLabel(labelSource);
	if (!label) {
		return undefined;
	}
	if (!label.id && generatedLabelId) {
		label.id = generatedLabelId;
	}
	return label.id || undefined;
}

function findAssociatedLabel(
	labelSource: LabelSource | null | undefined,
): HTMLLabelElement | undefined {
	if (!labelSource) {
		return undefined;
	}
	const parent = labelSource.parentElement;
	if (parent && parent.tagName === 'LABEL') {
		return parent as HTMLLabelElement;
	}
	const controlId = labelSource.id;
	if (controlId) {
		const nextSibling = labelSource.nextElementSibling as HTMLLabelElement | null;
		if (nextSibling && nextSibling.htmlFor === controlId) {
			return nextSibling;
		}
	}
	const labels = labelSource.labels;
	return labels ? (labels[0] as HTMLLabelElement | undefined) : undefined;
}
