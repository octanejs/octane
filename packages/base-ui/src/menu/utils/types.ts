import type { MenuRoot } from '../root/MenuRoot.tsrx';

export interface MenuOpenEventDetails {
	open: boolean;
	reason: MenuRoot.ChangeEventReason | null;
	nodeId: string | undefined;
	parentNodeId: string | null;
}
