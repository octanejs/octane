export interface TooltipProviderProps extends Record<string, unknown> {
	delayDuration?: number;
}

export interface TooltipContentProps extends Record<string, unknown> {
	className?: string;
	sideOffset?: number;
	children?: unknown;
}

export function TooltipProvider(props: TooltipProviderProps): any;
export function Tooltip(props: Record<string, unknown>): any;
export function TooltipTrigger(props: Record<string, unknown>): any;
export function TooltipContent(props: TooltipContentProps): any;
