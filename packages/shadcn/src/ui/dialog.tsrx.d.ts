type Props = { className?: string } & Record<string, unknown>;

export interface DialogContentProps extends Record<string, unknown> {
	className?: string;
	children?: unknown;
	showCloseButton?: boolean;
}

export interface DialogFooterProps extends Record<string, unknown> {
	className?: string;
	children?: unknown;
	showCloseButton?: boolean;
}

export function Dialog(props: Record<string, unknown>): any;
export function DialogTrigger(props: Record<string, unknown>): any;
export function DialogPortal(props: Record<string, unknown>): any;
export function DialogClose(props: Record<string, unknown>): any;
export function DialogOverlay(props: Props): any;
export function DialogContent(props: DialogContentProps): any;
export function DialogHeader(props: Props): any;
export function DialogFooter(props: DialogFooterProps): any;
export function DialogTitle(props: Props): any;
export function DialogDescription(props: Props): any;
