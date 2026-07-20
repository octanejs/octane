import { twMerge } from 'tailwind-merge';

type Variant = 'new' | 'sale' | 'neutral';

const variants: Record<Variant, string> = {
	new: 'bg-shop-accent text-shop-accent-ink border-transparent font-semibold',
	sale: 'text-shop-orange border-shop-orange bg-transparent',
	neutral: 'bg-shop-bg-2 text-shop-text border-shop-line-2',
};

/** Mono, uppercase pill used on product cards for New/Sale/Low-stock. */
export function ShopBadge({
	variant = 'neutral',
	children,
	className,
}: {
	variant?: Variant;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={twMerge(
				'inline-flex items-center font-shop-mono text-shop-2xs tracking-[0.1em] uppercase',
				'px-1.5 py-[3px] rounded border',
				variants[variant],
				className,
			)}
		>
			{children}
		</span>
	);
}
