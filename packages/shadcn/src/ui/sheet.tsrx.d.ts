type Props = { className?: string } & Record<string, unknown>;

export interface SheetContentProps extends Record<string, unknown> {
	className?: string;
	children?: unknown;
	side?: 'top' | 'right' | 'bottom' | 'left';
	showCloseButton?: boolean;
}

export function Sheet(props: Record<string, unknown>): any;
export function SheetTrigger(props: Record<string, unknown>): any;
export function SheetClose(props: Record<string, unknown>): any;
export function SheetContent(props: SheetContentProps): any;
export function SheetHeader(props: Props): any;
export function SheetFooter(props: Props): any;
export function SheetTitle(props: Props): any;
export function SheetDescription(props: Props): any;
