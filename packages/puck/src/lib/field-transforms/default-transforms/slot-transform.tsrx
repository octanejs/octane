import { OctaneNode } from '../../../react-shim.js';
import { DropZoneProps } from '../../../components/DropZone/types';
import { Content } from '../../../types';
import { FieldTransforms } from '../../../types/API/FieldTransforms';

export const getSlotTransform = (
	renderSlotEdit: (dzProps: DropZoneProps & { content: Content }) => OctaneNode,
	renderSlotRender: (dzProps: DropZoneProps & { content: Content }) => OctaneNode = renderSlotEdit,
): FieldTransforms => ({
	slot: ({ value: content, propName, field, isReadOnly }) => {
		const render = isReadOnly ? renderSlotRender : renderSlotEdit;

		const Slot = (dzProps: DropZoneProps) => render({
			allow: field?.type === 'slot' ? field.allow : [],
			disallow: field?.type === 'slot' ? field.disallow : [],
			...dzProps,
			zone: propName,
			content,
		});

		return Slot;
	},
});
