import { Range } from '@tiptap/core';
import { OctaneNode } from 'octane';

export type LinkToolbarProps = {
	url: string;
	text: string;
	range: Range;
	setToolbarOpen?: (open: boolean) => void;
	setToolbarPositionFrozen?: (frozen: boolean) => void;
	children?: OctaneNode;
};
