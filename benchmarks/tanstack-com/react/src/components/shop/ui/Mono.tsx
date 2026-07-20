import { twMerge } from 'tailwind-merge';

/**
 * Mono uppercase label used for section headings and metadata rows.
 * Consistent typography across the shop: JetBrains Mono, 10.5px,
 * 0.14em tracking, uppercase.
 */
export function ShopLabel({
	children,
	className,
	as: Tag = 'div',
}: {
	children: React.ReactNode;
	className?: string;
	as?: 'div' | 'h2' | 'h3' | 'h4' | 'legend' | 'span';
}) {
	return (
		<Tag
			className={twMerge(
				'font-shop-mono text-shop-xs tracking-[0.14em] uppercase text-shop-muted font-medium',
				className,
			)}
		>
			{children}
		</Tag>
	);
}

/** Mono text span for inline prices, counts, etc. — DM Mono, inherited size. */
export function ShopMono({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <span className={`font-shop-mono${className ? ` ${className}` : ''}`}>{children}</span>;
}
