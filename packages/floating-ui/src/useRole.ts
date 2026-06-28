// Ported from @floating-ui/react useRole — adds the base ARIA props to the
// reference + floating elements for a given role. `context` is the first arg;
// `props` is optional → splitSlot for the trailing slot.
import { useCallback, useMemo } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useFloatingParentNodeId } from './tree';
import { useId } from './useId';
import { getFloatingFocusElement } from './utils';

const componentRoleToAriaRoleMap = new Map<string, string | false>([
	['select', 'listbox'],
	['combobox', 'listbox'],
	['label', false],
]);

export function useRole(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const props = (user[1] as any) ?? {};

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
	const ariaRole = mapped != null ? mapped : role;
	const parentId = useFloatingParentNodeId();
	const isNested = parentId != null;

	const reference = useMemo(
		() => {
			if (ariaRole === 'tooltip' || role === 'label') {
				return {
					['aria-' + (role === 'label' ? 'labelledby' : 'describedby')]: open
						? floatingId
						: undefined,
				};
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

	const floating = useMemo(
		() => {
			const floatingProps: any = {
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
		(_ref: any) => {
			const { active, selected } = _ref;
			const commonProps: any = {
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

	return useMemo(
		() => (enabled ? { reference, floating, item } : {}),
		[enabled, reference, floating, item],
		subSlot(slot, 'm:ret'),
	);
}
