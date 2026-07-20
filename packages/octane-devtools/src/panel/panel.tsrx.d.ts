import type { OctaneDevtools } from 'octane/devtools';

export interface PanelOptions {
	position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
	openByDefault?: boolean;
}

export interface PanelProps {
	hook: OctaneDevtools;
	options?: PanelOptions;
}

export function Panel(props: PanelProps): any;
