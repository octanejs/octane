type Props = { className?: string } & Record<string, unknown>;

export interface PopoverContentProps extends Record<string, unknown> {
	className?: string;
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function Popover(props: Record<string, unknown>): any;
export function PopoverTrigger(props: Record<string, unknown>): any;
export function PopoverContent(props: PopoverContentProps): any;
export function PopoverAnchor(props: Record<string, unknown>): any;
export function PopoverHeader(props: Props): any;
export function PopoverTitle(props: Props): any;
export function PopoverDescription(props: Props): any;
