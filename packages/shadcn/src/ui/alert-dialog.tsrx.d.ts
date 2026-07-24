type Props = { className?: string } & Record<string, unknown>;

export interface AlertDialogContentProps extends Record<string, unknown> {
	className?: string;
	size?: 'default' | 'sm';
}

export interface AlertDialogActionProps extends Record<string, unknown> {
	className?: string;
	variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link' | null;
	size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg' | null;
}

export function AlertDialog(props: Record<string, unknown>): any;
export function AlertDialogTrigger(props: Record<string, unknown>): any;
export function AlertDialogPortal(props: Record<string, unknown>): any;
export function AlertDialogOverlay(props: Props): any;
export function AlertDialogContent(props: AlertDialogContentProps): any;
export function AlertDialogHeader(props: Props): any;
export function AlertDialogFooter(props: Props): any;
export function AlertDialogMedia(props: Props): any;
export function AlertDialogTitle(props: Props): any;
export function AlertDialogDescription(props: Props): any;
export function AlertDialogAction(props: AlertDialogActionProps): any;
export function AlertDialogCancel(props: AlertDialogActionProps): any;
