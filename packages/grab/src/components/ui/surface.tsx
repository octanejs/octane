/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';
import { cn } from '../../utils/cn.js';
import { createVariants } from '../../utils/create-variants.js';

const surfaceVariants = createVariants(
	'contain-layout antialiased [font-synthesis:none] bg-[var(--rg-panel-bg)]',
	{
		variants: {
			shape: {
				panel: 'rounded-[14px] [corner-shape:superellipse(1.25)]',
				pill: 'rounded-full',
			},
		},
		defaultVariants: { shape: 'panel' },
	},
);

interface SurfaceProps extends Record<string, unknown> {
	shape?: 'panel' | 'pill';
	class?: string;
	children?: OctaneNode;
	style?: Record<string, string | number>;
	ref?: (el: HTMLDivElement | null) => void;
}

export const Surface = (props: SurfaceProps) => {
	const { shape, class: className, children, ...rest } = props;
	return (
		<div class={cn(surfaceVariants({ shape }), className)} {...rest}>
			{children}
		</div>
	);
};
