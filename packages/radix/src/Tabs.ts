// Ported from @radix-ui/react-tabs. A set of layered content panels: List is a
// RovingFocusGroup of Triggers (`role=tab`, automatic-or-manual activation), Content
// panels mount through `Presence` (`role=tabpanel`), and trigger/content ids derive from
// one `baseId` so `aria-controls`/`aria-labelledby` wire up.
import { createElement, useEffect, useRef } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

const [createTabsContext, createTabsScope] = createContextScope('Tabs', [
	createRovingFocusGroupScope,
]);
export { createTabsScope };
const useRovingFocusGroupScope = createRovingFocusGroupScope();

interface TabsContextValue {
	baseId: string;
	value?: string;
	onValueChange: (value: string) => void;
	orientation?: 'horizontal' | 'vertical';
	dir?: 'ltr' | 'rtl';
	activationMode?: 'automatic' | 'manual';
}
const [TabsProvider, useTabsContext] = createTabsContext<TabsContextValue>('Tabs');

export function Root(props: any): any {
	const slot = S('Tabs.Root');
	const {
		__scopeTabs,
		value: valueProp,
		onValueChange,
		defaultValue,
		orientation = 'horizontal',
		dir,
		activationMode = 'automatic',
		...tabsProps
	} = props ?? {};
	const direction = dir === 'rtl' ? 'rtl' : 'ltr';
	const [value, setValue] = useControllableState<string>(
		{ prop: valueProp, onChange: onValueChange, defaultProp: defaultValue ?? '' },
		subSlot(slot, 'value'),
	);
	return createElement(TabsProvider, {
		scope: __scopeTabs,
		baseId: useId(subSlot(slot, 'id')),
		value,
		onValueChange: setValue,
		orientation,
		dir: direction,
		activationMode,
		children: createElement(Primitive.div, {
			dir: direction,
			'data-orientation': orientation,
			...tabsProps,
		}),
	});
}

export function List(props: any): any {
	const slot = S('Tabs.List');
	const { __scopeTabs, loop = true, ...listProps } = props ?? {};
	const context = useTabsContext('TabsList', __scopeTabs);
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeTabs, subSlot(slot, 'rfs'));
	return createElement(RovingFocusGroup.Root, {
		asChild: true,
		...rovingFocusGroupScope,
		orientation: context.orientation,
		dir: context.dir,
		loop,
		children: createElement(Primitive.div, {
			role: 'tablist',
			'aria-orientation': context.orientation,
			...listProps,
		}),
	});
}

export function Trigger(props: any): any {
	const slot = S('Tabs.Trigger');
	const { __scopeTabs, value, disabled = false, ...triggerProps } = props ?? {};
	const context = useTabsContext('TabsTrigger', __scopeTabs);
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeTabs, subSlot(slot, 'rfs'));
	const triggerId = makeTriggerId(context.baseId, value);
	const contentId = makeContentId(context.baseId, value);
	const isSelected = value === context.value;
	return createElement(RovingFocusGroup.Item, {
		asChild: true,
		...rovingFocusGroupScope,
		focusable: !disabled,
		active: isSelected,
		children: createElement(Primitive.button, {
			type: 'button',
			role: 'tab',
			'aria-selected': isSelected,
			'aria-controls': contentId,
			'data-state': isSelected ? 'active' : 'inactive',
			'data-disabled': disabled ? '' : undefined,
			disabled,
			id: triggerId,
			...triggerProps,
			onMouseDown: composeEventHandlers(props?.onMouseDown, (event: MouseEvent) => {
				// Only activate on left-click without ctrl (right-click / ctrl-click are
				// context-menu gestures).
				if (!disabled && event.button === 0 && event.ctrlKey === false) {
					context.onValueChange(value);
				} else {
					event.preventDefault();
				}
			}),
			onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
				if ([' ', 'Enter'].includes(event.key)) context.onValueChange(value);
			}),
			onFocus: composeEventHandlers(props?.onFocus, () => {
				// Automatic activation: focusing a tab (e.g. via arrow keys) selects it.
				const isAutomaticActivation = context.activationMode !== 'manual';
				if (!isSelected && !disabled && isAutomaticActivation) {
					context.onValueChange(value);
				}
			}),
		}),
	});
}

export function Content(props: any): any {
	const slot = S('Tabs.Content');
	const { __scopeTabs, value, forceMount, children, ...contentProps } = props ?? {};
	const context = useTabsContext('TabsContent', __scopeTabs);
	const triggerId = makeTriggerId(context.baseId, value);
	const contentId = makeContentId(context.baseId, value);
	const isSelected = value === context.value;
	const isMountAnimationPreventedRef = useRef(isSelected, subSlot(slot, 'prevent'));

	useEffect(
		() => {
			const rAF = requestAnimationFrame(() => (isMountAnimationPreventedRef.current = false));
			return () => cancelAnimationFrame(rAF);
		},
		[],
		subSlot(slot, 'e:mount'),
	);

	return createElement(Presence, {
		present: forceMount || isSelected,
		children: ({ present }: { present: boolean }) =>
			createElement(Primitive.div, {
				'data-state': isSelected ? 'active' : 'inactive',
				'data-orientation': context.orientation,
				role: 'tabpanel',
				'aria-labelledby': triggerId,
				hidden: !present,
				id: contentId,
				tabIndex: 0,
				...contentProps,
				style: {
					...props.style,
					animationDuration: isMountAnimationPreventedRef.current ? '0s' : undefined,
				},
				children: present ? children : null,
			}),
	});
}

function makeTriggerId(baseId: string, value: string): string {
	return `${baseId}-trigger-${value}`;
}
function makeContentId(baseId: string, value: string): string {
	return `${baseId}-content-${value}`;
}

export { Root as Tabs };
