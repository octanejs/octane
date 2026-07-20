import * as React from 'react';
import { twMerge } from 'tailwind-merge';

/**
 * A bordered surface card — live drop card, cart summary, product info box,
 * etc. Use padding + flex utilities on the consumer to arrange contents.
 */
export const ShopPanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	function ShopPanel({ className, children, ...rest }, ref) {
		return (
			<div
				ref={ref}
				{...rest}
				className={twMerge('border border-shop-line rounded-xl bg-shop-panel', className)}
			>
				{children}
			</div>
		);
	},
);
