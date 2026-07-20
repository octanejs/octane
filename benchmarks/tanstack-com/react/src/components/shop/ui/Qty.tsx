import { Minus, Plus } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type Props = {
	quantity: number;
	onChange: (next: number) => void;
	min?: number;
	max?: number;
	disabled?: boolean;
	size?: 'sm' | 'md';
	className?: string;
};

/**
 * Quantity stepper — shared between the PDP add-to-cart row, the cart page,
 * and the cart drawer. Mono digit in the center, chrome-free buttons on each
 * side.
 */
export function ShopQty({
	quantity,
	onChange,
	min = 0,
	max = 99,
	disabled,
	size = 'md',
	className,
}: Props) {
	const cell =
		size === 'sm' ? 'h-7 w-7 [&_svg]:w-3 [&_svg]:h-3' : 'h-10 w-8 [&_svg]:w-3.5 [&_svg]:h-3.5';
	return (
		<div
			className={twMerge(
				'inline-flex items-center border border-shop-line rounded-md bg-shop-panel',
				'px-1.5',
				className,
			)}
		>
			<button
				type="button"
				onClick={() => onChange(quantity - 1)}
				disabled={disabled || quantity <= min}
				aria-label="Decrease quantity"
				className={twMerge(
					'grid place-items-center text-shop-text-2 disabled:opacity-50 disabled:cursor-not-allowed',
					cell,
				)}
			>
				<Minus />
			</button>
			<span className="font-shop-mono text-[13px] text-shop-text min-w-[1.5rem] text-center select-none">
				{quantity}
			</span>
			<button
				type="button"
				onClick={() => onChange(quantity + 1)}
				disabled={disabled || quantity >= max}
				aria-label="Increase quantity"
				className={twMerge(
					'grid place-items-center text-shop-text-2 disabled:opacity-50 disabled:cursor-not-allowed',
					cell,
				)}
			>
				<Plus />
			</button>
		</div>
	);
}
