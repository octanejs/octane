// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/menu/utils.ts).
// octane adaptations: `TreeState` type from the ported stately tree state (upstream:
// 'react-stately/useTreeState').
import type { Key } from '@react-types/shared';
import type { TreeState } from '../stately/tree/useTreeState';

interface MenuData {
	onClose?: () => void;
	onAction?: (key: Key, value: any) => void;
	shouldUseVirtualFocus?: boolean;
}

export const menuData: WeakMap<TreeState<unknown>, MenuData> = new WeakMap<
	TreeState<unknown>,
	MenuData
>();
