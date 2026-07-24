type Props = { className?: string } & Record<string, unknown>;

export function Menubar(props: Props): any;
export function MenubarMenu(props: Record<string, unknown>): any;
export function MenubarGroup(props: Record<string, unknown>): any;
export function MenubarPortal(props: Record<string, unknown>): any;
export function MenubarRadioGroup(props: Record<string, unknown>): any;
export function MenubarTrigger(props: Props): any;
export function MenubarContent(
	props: Props & { align?: 'start' | 'center' | 'end'; alignOffset?: number; sideOffset?: number },
): any;
export function MenubarItem(
	props: Props & { inset?: boolean; variant?: 'default' | 'destructive' },
): any;
export function MenubarCheckboxItem(
	props: Props & { children?: unknown; checked?: boolean | 'indeterminate'; inset?: boolean },
): any;
export function MenubarRadioItem(props: Props & { children?: unknown; inset?: boolean }): any;
export function MenubarLabel(props: Props & { inset?: boolean }): any;
export function MenubarSeparator(props: Props): any;
export function MenubarShortcut(props: Props): any;
export function MenubarSub(props: Record<string, unknown>): any;
export function MenubarSubTrigger(props: Props & { inset?: boolean; children?: unknown }): any;
export function MenubarSubContent(props: Props): any;
export {};
