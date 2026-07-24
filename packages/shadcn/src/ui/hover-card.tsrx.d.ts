export interface HoverCardContentProps extends Record<string, unknown> {
	className?: string;
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function HoverCard(props: Record<string, unknown>): any;
export function HoverCardTrigger(props: Record<string, unknown>): any;
export function HoverCardContent(props: HoverCardContentProps): any;
