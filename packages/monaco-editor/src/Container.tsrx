import type { OctaneNode } from 'octane';

import type { WrapperProps } from './types';

const LOADING_STYLE = {
	alignItems: 'center',
	display: 'flex',
	height: '100%',
	justifyContent: 'center',
	width: '100%',
};

export interface ContainerProps {
	width: number | string;
	height: number | string;
	isEditorReady: boolean;
	loading: OctaneNode;
	containerRef: { current: HTMLDivElement | null };
	className?: string;
	wrapperProps: WrapperProps;
}

export function Container(props: ContainerProps) @{
	const { width, height, isEditorReady, loading, containerRef, className, wrapperProps } = props;
	const wrapperStyle = {
		display: 'flex' as const,
		position: 'relative' as const,
		textAlign: 'initial' as const,
		width,
		height,
	};
	const editorStyle = {
		display: isEditorReady ? undefined : 'none' as const,
		width: '100%',
	};

	<section style={wrapperStyle} {...wrapperProps}>
		@if (!isEditorReady) {
			<div style={LOADING_STYLE}>{loading}</div>
		}
		<div ref={containerRef} style={editorStyle} class={className} />
	</section>
}
