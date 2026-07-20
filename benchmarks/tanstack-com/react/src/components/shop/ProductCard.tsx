import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { ProductImage } from './ProductImage';
import { ShopMono } from './ui';
import { formatMoney, shopifyImageUrl } from '~/utils/shopify-format';
import type { ProductListItem } from '~/utils/shopify-queries';

const TWO_WEEKS_MS = 365 * 24 * 60 * 60 * 1000;

// Kept in sync with ProductDrawer COLOR_HEX — last token wins ("Vintage Black" → black)
const COLOR_MAP: Record<string, string> = {
	black: '#0a0a0a',
	white: '#f5f5f0',
	cream: '#e4dcc4',
	bone: '#e4dcc4',
	natural: '#ddd3b8',
	vintage: '#e8e0d0',
	fog: '#c9c6ba',
	sand: '#c8b97a',
	ink: '#16130d',
	navy: '#1a2e50',
	slate: '#2e3339',
	olive: '#5a5a3a',
	rust: '#b84a27',
	red: '#c41d1d',
	blue: '#1d4ed8',
	sea: '#3a5d66',
	green: '#15803d',
	gray: '#6b7280',
	grey: '#6b7280',
	charcoal: '#3a3a3c',
	heather: '#8a8a9a',
	denim: '#1a4569',
	brown: '#6b3a2a',
	pink: '#e8749a',
	purple: '#7c3aed',
	yellow: '#ca8a04',
	orange: '#c2410c',
	royal: '#4169e1',
	kelly: '#4daa59',
	aqua: '#00c4d4',
	rose: '#c8818a',
	dusty: '#c8818a',
	coral: '#e8756a',
	forest: '#228b22',
	teal: '#0d9488',
	lavender: '#967bb6',
	lilac: '#967bb6',
	tan: '#d2b48c',
	ivory: '#fffff0',
	gold: '#c9a227',
	silver: '#a8a9ad',
	ash: '#b2bec3',
	stone: '#78716c',
	moss: '#6b7c55',
	sage: '#87a878',
	sky: '#0ea5e9',
	midnight: '#1e1b4b',
	espresso: '#3c1f0f',
	// card-specific
	mixed: '#ef4c7a',
	holo: '#d6e7ff',
	polished: '#c5b07a',
	blend: '#e8e0d0',
};

// Last token wins: "Vintage Black" → ["vintage","black"] reversed → "black" wins
function colorHex(name: string): string | undefined {
	const tokens = name
		.toLowerCase()
		.split(/[\s_-]+/)
		.reverse();
	for (const token of tokens) {
		if (COLOR_MAP[token]) return COLOR_MAP[token];
	}
	return undefined;
}

const NEW_BADGE_GRADIENT =
	'linear-gradient(180deg, rgba(116,220,255,0.99) 8.23%, rgba(255,242,124,0.99) 29.88%, rgba(255,160,92,0.99) 61.46%, rgba(255,95,95,0.99) 89.43%)';

function NewBadge() {
	return (
		<div
			className="absolute bottom-3 left-3 z-[2] h-5 px-2.5 rounded-full flex items-center"
			style={{ background: NEW_BADGE_GRADIENT }}
		>
			<span className="font-shop-mono font-medium text-shop-xs text-black leading-none tracking-wide">
				NEW
			</span>
		</div>
	);
}

type ProductCardProps = {
	product: ProductListItem;
	sizes?: string;
	loading?: 'eager' | 'lazy';
	onQuickView?: (handle: string) => void;
};

export function ProductCard({ product, sizes, loading = 'lazy', onQuickView }: ProductCardProps) {
	const { minVariantPrice, maxVariantPrice } = product.priceRange;
	const compareAt = product.compareAtPriceRange?.minVariantPrice;
	const isRange = minVariantPrice.amount !== maxVariantPrice.amount;

	const isNew = product.publishedAt
		? Date.now() - new Date(product.publishedAt).getTime() < TWO_WEEKS_MS
		: false;

	const colorOption = product.options?.find((o) => /colou?r/i.test(o.name));
	const swatches = colorOption
		? colorOption.values.slice(0, 6).map((v) => ({
				name: v,
				hex: colorHex(v),
			}))
		: [];

	const [hoveredColor, setHoveredColor] = React.useState<string | null>(null);

	// Preload all color-variant images on mount so hover swaps are instant
	React.useEffect(() => {
		if (!colorOption) return;
		const seen = new Set<string>();
		for (const v of product.variants.nodes) {
			if (!v.image?.url || seen.has(v.image.url)) continue;
			seen.add(v.image.url);
			const img = new Image();
			img.src = shopifyImageUrl(v.image.url, { width: 600, format: 'webp' });
		}
	}, [colorOption, product.variants.nodes]);

	const activeImage = React.useMemo(() => {
		if (!hoveredColor || !colorOption) return product.featuredImage;
		const variant = product.variants.nodes.find((v) =>
			v.selectedOptions.some((o) => /colou?r/i.test(o.name) && o.value === hoveredColor),
		);
		return variant?.image ?? product.featuredImage;
	}, [hoveredColor, colorOption, product]);

	const cardBody = (
		<div
			className="
        group flex flex-col min-w-[340px] max-w-[400px] w-full rounded-xl
        border border-transparent bg-transparent
        hover:bg-[#EFEFE3] dark:hover:bg-shop-bg-2 hover:border-shop-line-2
        transition-[border-color,background-color] duration-200
        px-[22px] pt-7 pb-5
      "
		>
			{/* Image */}
			<div className="relative aspect-square rounded-lg overflow-hidden">
				<ProductImage
					image={activeImage}
					alt={product.title}
					width={600}
					sizes={sizes}
					loading={loading}
					className="w-full h-full object-cover"
				/>
				{isNew ? <NewBadge /> : null}
			</div>

			{/* Meta */}
			<div className="flex flex-col gap-2.5 pt-4">
				{/* Title + price */}
				<div className="flex justify-between items-baseline gap-3">
					<span className="text-shop-title font-semibold font-shop-display leading-tight text-shop-text truncate">
						{product.title}
					</span>
					<ShopMono className="text-shop-price text-shop-text whitespace-nowrap shrink-0 font-light">
						{isRange ? 'From ' : ''}
						{formatMoney(minVariantPrice.amount, minVariantPrice.currencyCode)}
						{compareAt && Number(compareAt.amount) > Number(minVariantPrice.amount) ? (
							<span className="ml-1.5 text-shop-ui text-shop-muted line-through">
								{formatMoney(compareAt.amount, compareAt.currencyCode)}
							</span>
						) : null}
					</ShopMono>
				</div>

				{/* Swatches + Quick View row */}
				<div className="flex items-center justify-between">
					{/* Round color swatches — hover to preview color */}
					<div className="flex gap-[10px]" onMouseLeave={() => setHoveredColor(null)}>
						{swatches.map((s) => (
							<span
								key={s.name}
								title={s.name}
								onMouseEnter={() => setHoveredColor(s.name)}
								className={`w-4 h-4 rounded-full shrink-0 cursor-pointer border transition-[box-shadow,border-color,transform] duration-150 ${
									hoveredColor === s.name
										? 'border-white/70 ring-2 ring-white/30 scale-125'
										: 'border-white/15 hover:scale-110'
								}`}
								style={
									s.hex
										? { background: s.hex }
										: {
												background:
													'conic-gradient(from 30deg,#ef4c7a,#f4c74a,#22c993,#36d3f3,#4b9bff,#ef4c7a)',
											}
								}
							/>
						))}
					</div>

					{/* Quick View — hover only */}
					<span className="opacity-0 group-hover:opacity-100 transition-opacity text-shop-xs text-shop-text-2 inline-flex items-center gap-1">
						Quick View
						<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
							<path d="M2 5h6M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.6" fill="none" />
						</svg>
					</span>
				</div>
			</div>
		</div>
	);

	if (onQuickView) {
		return (
			<button
				type="button"
				onClick={() => onQuickView(product.handle)}
				className="text-left block cursor-pointer bg-transparent border-0 p-0"
			>
				{cardBody}
			</button>
		);
	}

	return (
		<Link to="/shop/$handle" params={{ handle: product.handle }} className="block">
			{cardBody}
		</Link>
	);
}
