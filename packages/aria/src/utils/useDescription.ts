// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useDescription.ts).

import type { AriaLabelingProps } from '@react-types/shared';
import { useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLayoutEffect } from './useLayoutEffect';

let descriptionId = 0;
const descriptionNodes = new Map<string, { refCount: number; element: Element }>();

export function useDescription(description?: string): AriaLabelingProps;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDescription(
	description: string | undefined,
	slot: symbol | undefined,
): AriaLabelingProps;
export function useDescription(...args: any[]): AriaLabelingProps {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDescription');
	const description = user[0] as string | undefined;

	let [id, setId] = useState<string | undefined>(undefined, subSlot(slot, 'id'));

	useLayoutEffect(
		() => {
			if (!description) {
				return;
			}

			let desc = descriptionNodes.get(description);
			if (!desc) {
				let id = `react-aria-description-${descriptionId++}`;
				setId(id);

				let node = document.createElement('div');
				node.id = id;
				node.style.display = 'none';
				node.textContent = description;
				document.body.appendChild(node);
				desc = { refCount: 0, element: node };
				descriptionNodes.set(description, desc);
			} else {
				setId(desc.element.id);
			}

			desc.refCount++;
			return () => {
				if (desc && --desc.refCount === 0) {
					desc.element.remove();
					descriptionNodes.delete(description);
				}
			};
		},
		[description],
		subSlot(slot, 'register'),
	);

	return {
		'aria-describedby': description ? id : undefined,
	};
}
