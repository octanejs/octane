import { createContext } from 'octane';
import type { RegisteredPanel } from '../panel/types';
import type { RegisteredSeparator } from '../separator/types';
import type { Orientation } from './types';

export type PanelStyles = {
	flexGrow?: number;
	pointerEvents?: 'none';
};

export type GroupContextValue = {
	disableCursor: boolean;
	getPanelStyles(groupId: string, panelId: string): PanelStyles | undefined;
	id: string;
	orientation: Orientation;
	registerPanel(panel: RegisteredPanel): () => void;
	registerSeparator(separator: RegisteredSeparator): () => void;
	updatePanelProps(id: string, props: { disabled: boolean | undefined }): void;
	updateSeparatorProps(
		id: string,
		props: { disabled: boolean | undefined; disableDoubleClick: boolean | undefined },
	): void;
};

export const GroupContext = createContext<GroupContextValue | null>(null);
