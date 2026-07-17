import type { Editor } from '@tiptap/core';
import { expectTypeOf } from 'vitest';

import {
	BubbleMenu,
	type BubbleMenuProps,
	FloatingMenu,
	type FloatingMenuProps,
} from '@octanejs/tiptap/menus';

expectTypeOf(BubbleMenu).toBeFunction();
expectTypeOf(FloatingMenu).toBeFunction();

const bubbleProps: BubbleMenuProps = {
	children: 'bubble',
	class: ['menu', { active: true }],
	onClick(event) {
		expectTypeOf(event).toEqualTypeOf<MouseEvent>();
	},
};

const floatingProps = {
	editor: null as Editor | null,
	children: 'floating',
	ref: { current: null as HTMLDivElement | null },
} satisfies FloatingMenuProps;

BubbleMenu(bubbleProps);
FloatingMenu(floatingProps);
