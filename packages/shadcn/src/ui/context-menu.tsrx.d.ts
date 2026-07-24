type Props = { className?: string } & Record<string, unknown>;

export function ContextMenu(props: Record<string, unknown>): any;
export function ContextMenuTrigger(props: Props): any;
export function ContextMenuGroup(props: Record<string, unknown>): any;
export function ContextMenuPortal(props: Record<string, unknown>): any;
export function ContextMenuSub(props: Record<string, unknown>): any;
export function ContextMenuRadioGroup(props: Record<string, unknown>): any;
export function ContextMenuContent(
	props: Props & { side?: 'top' | 'right' | 'bottom' | 'left' },
): any;
export function ContextMenuItem(
	props: Props & { inset?: boolean; variant?: 'default' | 'destructive' },
): any;
export function ContextMenuSubTrigger(props: Props & { inset?: boolean; children?: unknown }): any;
export function ContextMenuSubContent(props: Props): any;
export function ContextMenuCheckboxItem(
	props: Props & { children?: unknown; checked?: boolean | 'indeterminate'; inset?: boolean },
): any;
export function ContextMenuRadioItem(props: Props & { children?: unknown; inset?: boolean }): any;
export function ContextMenuLabel(props: Props & { inset?: boolean }): any;
export function ContextMenuSeparator(props: Props): any;
export function ContextMenuShortcut(props: Props): any;
export {};
