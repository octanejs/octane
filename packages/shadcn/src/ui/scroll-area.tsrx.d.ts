type Props = { className?: string } & Record<string, unknown>;

export interface ScrollBarProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'vertical' | 'horizontal';
}

export function ScrollArea(props: Props & { children?: unknown }): any;
export function ScrollBar(props: ScrollBarProps): any;
