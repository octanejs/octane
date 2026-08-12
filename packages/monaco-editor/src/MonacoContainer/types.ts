import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type WrapperProps = Omit<Octane.JSX.IntrinsicElements['section'], 'children'>;

export type ContainerProps = {
	width: number | string;
	height: number | string;
	isEditorReady: boolean;
	loading: OctaneNode;
	/** Octane host ref (upstream used private `_ref`). */
	ref: { current: HTMLDivElement | null };
	className?: string;
	wrapperProps?: WrapperProps;
};
