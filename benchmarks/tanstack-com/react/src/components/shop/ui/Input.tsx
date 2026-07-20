import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

/** Shop-styled input. */
export const ShopInput = React.forwardRef<HTMLInputElement, Props>(function ShopInput(
	{ className, ...rest },
	ref,
) {
	return (
		<input
			ref={ref}
			{...rest}
			className={twMerge(
				'px-2.5 py-2 border border-shop-line rounded-md',
				'bg-shop-panel text-shop-text text-[13px]',
				'placeholder:text-shop-muted',
				'focus:outline-none focus:border-shop-accent',
				'w-full',
				className,
			)}
		/>
	);
});
