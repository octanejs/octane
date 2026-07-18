// Ported from @floating-ui/react useRole — adds the base ARIA props to the
// reference + floating elements for a given role. `context` is the first arg;
// `props` is optional → splitSlot for the trailing slot.
import { useCallback, useMemo } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useFloatingParentNodeId } from './tree';
import { useId } from './useId';
import { getFloatingFocusElement } from './utils';
import type { ElementProps, ExtendedUserProps, FloatingRootContext, HTMLProps } from './types';

type AriaRole = 'tooltip' | 'dialog' | 'alertdialog' | 'menu' | 'listbox' | 'grid' | 'tree';
type ComponentRole = 'select' | 'label' | 'combobox';

export interface UseRoleProps {
	/**
	 * Whether the Hook is enabled, including all internal Effects and event
	 * handlers.
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * The role of the floating element.
	 * @default 'dialog'
	 */
	role?: AriaRole | ComponentRole;
}

const componentRoleToAriaRoleMap = new Map<AriaRole | ComponentRole, AriaRole | false>([
	['select', 'listbox'],
	['combobox', 'listbox'],
	['label', false],
]);

/**
 * Adds base screen reader props to the reference and floating elements for a
 * given floating element `role`.
 * @see https://floating-ui.com/docs/useRole
 */
export function useRole(
	context: FloatingRootContext,
	props?: UseRoleProps,
	slot?: symbol,
): ElementProps;
export function useRole(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = (user[1] as UseRoleProps) ?? {};

	const open = context.open;
	const elements = context.elements;
	const defaultFloatingId = context.floatingId;

	const enabled = props.enabled ?? true;
	const role = props.role ?? 'dialog';

	const defaultReferenceId = useId(subSlot(slot, 'refid'));
	const referenceId = elements.domReference?.id || defaultReferenceId;
	const floatingId = useMemo(
		() => getFloatingFocusElement(elements.floating)?.id || defaultFloatingId,
		[elements.floating, defaultFloatingId],
		subSlot(slot, 'm:fid'),
	);
	const mapped = componentRoleToAriaRoleMap.get(role);
	// The map covers every ComponentRole, so the fallback `role` is an AriaRole.
	const ariaRole = (mapped != null ? mapped : role) as AriaRole | false;
	const parentId = useFloatingParentNodeId();
	const isNested = parentId != null;

	const reference = useMemo<HTMLProps<Element>>(
		() => {
			if (ariaRole === 'tooltip' || role === 'label') {
				return {
					['aria-' + (role === 'label' ? 'labelledby' : 'describedby')]: open
						? floatingId
						: undefined,
				} as HTMLProps<Element>;
			}
			return {
				'aria-expanded': open ? 'true' : 'false',
				'aria-haspopup': ariaRole === 'alertdialog' ? 'dialog' : ariaRole,
				'aria-controls': open ? floatingId : undefined,
				...(ariaRole === 'listbox' && { role: 'combobox' }),
				...(ariaRole === 'menu' && { id: referenceId }),
				...(ariaRole === 'menu' && isNested && { role: 'menuitem' }),
				...(role === 'select' && { 'aria-autocomplete': 'none' }),
				...(role === 'combobox' && { 'aria-autocomplete': 'list' }),
			};
		},
		[ariaRole, floatingId, isNested, open, referenceId, role],
		subSlot(slot, 'm:ref'),
	);

	const floating = useMemo<HTMLProps<HTMLElement>>(
		() => {
			const floatingProps: HTMLProps<HTMLElement> = {
				id: floatingId,
				...(ariaRole && { role: ariaRole }),
			};
			if (ariaRole === 'tooltip' || role === 'label') {
				return floatingProps;
			}
			return {
				...floatingProps,
				...(ariaRole === 'menu' && { 'aria-labelledby': referenceId }),
			};
		},
		[ariaRole, floatingId, referenceId, role],
		subSlot(slot, 'm:flo'),
	);

	const item = useCallback(
		(_ref: ExtendedUserProps): HTMLProps<HTMLElement> => {
			const { active, selected } = _ref;
			const commonProps: HTMLProps<HTMLElement> = {
				role: 'option',
				...(active && { id: floatingId + '-fui-option' }),
			};
			switch (role) {
				case 'select':
				case 'combobox':
					return { ...commonProps, 'aria-selected': selected };
			}
			return {};
		},
		[floatingId, role],
		subSlot(slot, 'cb:item'),
	);

	return useMemo<ElementProps>(
		() => (enabled ? { reference, floating, item } : {}),
		[enabled, reference, floating, item],
		subSlot(slot, 'm:ret'),
	);
}
