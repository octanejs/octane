// Ported from @radix-ui/react-toolbar (source:
// .radix-primitives/packages/react/toolbar/src/toolbar.tsx). A `role=toolbar` container
// whose Buttons/Links/ToggleItems participate in one RovingFocusGroup; embeds ToggleGroup
// (with its own roving disabled — the toolbar owns focus) and Separator (flipped
// orientation).
import { createElement } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import * as SeparatorPrimitive from './Separator';
import * as ToggleGroupPrimitive from './ToggleGroup';
import { createToggleGroupScope } from './ToggleGroup';

const [createToolbarContext, createToolbarScope] = createContextScope('Toolbar', [
	createRovingFocusGroupScope,
	createToggleGroupScope,
]);
export { createToolbarScope };
const useRovingFocusGroupScope = createRovingFocusGroupScope();
const useToggleGroupScope = createToggleGroupScope();

const [ToolbarProvider, useToolbarContext] = createToolbarContext<{
	orientation: 'horizontal' | 'vertical';
	dir: 'ltr' | 'rtl';
}>('Toolbar');

export function Root(props: any): any {
	const slot = S('Toolbar.Root');
	const {
		__scopeToolbar,
		orientation = 'horizontal',
		dir,
		loop = true,
		...toolbarProps
	} = props ?? {};
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeToolbar, subSlot(slot, 'rfs'));
	const direction = dir === 'rtl' ? 'rtl' : 'ltr';
	return createElement(ToolbarProvider, {
		scope: __scopeToolbar,
		orientation,
		dir: direction,
		children: createElement(RovingFocusGroup.Root, {
			asChild: true,
			...rovingFocusGroupScope,
			orientation,
			dir: direction,
			loop,
			children: createElement(Primitive.div, {
				role: 'toolbar',
				'aria-orientation': orientation,
				dir: direction,
				...toolbarProps,
			}),
		}),
	});
}

export function Separator(props: any): any {
	const { __scopeToolbar, ...separatorProps } = props ?? {};
	const context = useToolbarContext('ToolbarSeparator', __scopeToolbar);
	return createElement(SeparatorPrimitive.Root, {
		orientation: context.orientation === 'horizontal' ? 'vertical' : 'horizontal',
		...separatorProps,
	});
}

export function Button(props: any): any {
	const slot = S('Toolbar.Button');
	const { __scopeToolbar, ...buttonProps } = props ?? {};
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeToolbar, subSlot(slot, 'rfs'));
	return createElement(RovingFocusGroup.Item, {
		asChild: true,
		...rovingFocusGroupScope,
		focusable: !props?.disabled,
		children: createElement(Primitive.button, { type: 'button', ...buttonProps }),
	});
}

export function Link(props: any): any {
	const slot = S('Toolbar.Link');
	const { __scopeToolbar, ...linkProps } = props ?? {};
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeToolbar, subSlot(slot, 'rfs'));
	return createElement(RovingFocusGroup.Item, {
		asChild: true,
		...rovingFocusGroupScope,
		focusable: true,
		children: createElement(Primitive.a, {
			...linkProps,
			onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
				if (event.key === ' ') (event.currentTarget as HTMLElement).click();
			}),
		}),
	});
}

export function ToggleGroup(props: any): any {
	const slot = S('Toolbar.ToggleGroup');
	const { __scopeToolbar, ...toggleGroupProps } = props ?? {};
	const context = useToolbarContext('ToolbarToggleGroup', __scopeToolbar);
	const toggleGroupScope = useToggleGroupScope(__scopeToolbar, subSlot(slot, 'tgs'));
	return createElement(ToggleGroupPrimitive.Root, {
		'data-orientation': context.orientation,
		dir: context.dir,
		...toggleGroupScope,
		...toggleGroupProps,
		// The toolbar is the roving group; the embedded toggle group must not compete.
		rovingFocus: false,
	});
}

export function ToggleItem(props: any): any {
	const slot = S('Toolbar.ToggleItem');
	const { __scopeToolbar, ...toggleItemProps } = props ?? {};
	const toggleGroupScope = useToggleGroupScope(__scopeToolbar, subSlot(slot, 'tgs'));
	const scope = { __scopeToolbar };
	return createElement(Button, {
		asChild: true,
		...scope,
		children: createElement(ToggleGroupPrimitive.Item, {
			...toggleGroupScope,
			...toggleItemProps,
		}),
	});
}

export { Root as Toolbar, Button as ToolbarButton, Link as ToolbarLink };
