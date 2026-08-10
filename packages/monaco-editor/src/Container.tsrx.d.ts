import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import type { WrapperProps } from './types';

export interface ContainerProps {
	width: number | string;
	height: number | string;
	isEditorReady: boolean;
	loading: OctaneNode;
	containerRef: { current: HTMLDivElement | null };
	className?: string;
	wrapperProps: WrapperProps;
}

export declare function Container(props: ContainerProps): Octane.JSX.Element;
