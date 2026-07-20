import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	isSelected?: boolean;
	isUnavailable?: boolean;
};

/** Size cell used in the variant selector grid. Mono, short, tappable. */
export const ShopSize = React.forwardRef<HTMLButtonElement, Props>(function ShopSize(
	{ isSelected, isUnavailable, children, className, disabled, ...rest },
	ref,
) {
	return (
		<button
			ref={ref}
			type="button"
			aria-pressed={isSelected}
			disabled={disabled ?? isUnavailable}
			{...rest}
			className={twMerge(
				'px-0 py-2.5 rounded-md text-center border border-shop-line',
				'font-shop-mono font-medium text-shop-sm',
				'bg-shop-surface text-shop-text',
				'transition-[border-color,background-color]',
				'hover:enabled:bg-shop-surface-hover hover:enabled:border-shop-line-2',
				isSelected && 'bg-shop-accent text-shop-accent-ink border-shop-accent',
				isUnavailable &&
					!isSelected &&
					'line-through text-shop-muted opacity-40 cursor-not-allowed',
				className,
			)}
		>
			{children}
		</button>
	);
});
