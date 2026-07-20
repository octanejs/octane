import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { twMerge } from 'tailwind-merge';
import { getProduct } from '~/utils/shop.functions';
import type { ProductDetail, ProductDetailVariant } from '~/utils/shopify-queries';
import { formatMoney } from '~/utils/shopify-format';
import { ProductImage } from './ProductImage';
import { ShopMono, ShopSelect } from './ui';
import { useAddToCart } from '~/hooks/useCart';
import { useCartDrawerStore } from './cartDrawerStore';

// Color name → hex for chip fill. Tokenizes multi-word names ("Vintage White" → "white").
const COLOR_HEX: Record<string, string> = {
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
	maroon: '#800020',
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
};

const MAX_INLINE_OPTION_VALUES = 8;
const DEFAULT_DRAWER_WIDTH = 1000;
const MIN_DRAWER_WIDTH = 320;
const MOBILE_DRAWER_BREAKPOINT = 768;

function isDarkColor(hex: string): boolean {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.15;
}

function resolveColorHex(name: string): string | undefined {
	const lower = name.toLowerCase();
	if (COLOR_HEX[lower]) return COLOR_HEX[lower];
	// Reverse so last token wins ("Vintage Black" → black, not vintage)
	const tokens = lower.split(/[\s_-]+/).reverse();
	for (const token of tokens) {
		if (COLOR_HEX[token]) return COLOR_HEX[token];
	}
	return undefined;
}

function findMatchingVariant(
	variants: Array<ProductDetailVariant>,
	selected: Record<string, string>,
): ProductDetailVariant | undefined {
	// Empty string means "not yet chosen" — treated as wildcard for availability checks
	return variants.find((v) =>
		v.selectedOptions.every((o) => {
			const s = selected[o.name];
			return !s || s === o.value;
		}),
	);
}

function findExactVariant(
	variants: Array<ProductDetailVariant>,
	selected: Record<string, string>,
): ProductDetailVariant | undefined {
	return variants.find((v) => v.selectedOptions.every((o) => selected[o.name] === o.value));
}

type ProductDrawerProps = {
	productHandle: string | null;
	initialProduct?: ProductDetail | null;
	allHandles: string[];
	onClose: () => void;
	onChange: (handle: string) => void;
};

function getInitialProduct(handle: string | null, product: ProductDetail | null | undefined) {
	if (!handle || product?.handle !== handle) return undefined;
	return product;
}

function getDrawerMaxWidth() {
	if (typeof window === 'undefined') return DEFAULT_DRAWER_WIDTH;
	if (window.innerWidth < MOBILE_DRAWER_BREAKPOINT) return window.innerWidth;
	return Math.floor(window.innerWidth * 0.8);
}

function clampDrawerWidth(width: number) {
	if (typeof window === 'undefined') return width;
	if (window.innerWidth < MOBILE_DRAWER_BREAKPOINT) return window.innerWidth;
	return Math.max(MIN_DRAWER_WIDTH, Math.min(getDrawerMaxWidth(), width));
}

export function ProductDrawer({
	productHandle,
	initialProduct,
	allHandles,
	onClose,
	onChange,
}: ProductDrawerProps) {
	const [width, setWidth] = React.useState(DEFAULT_DRAWER_WIDTH);
	const [isDragging, setIsDragging] = React.useState(false);
	const dragStateRef = React.useRef<{ startX: number; startW: number }>({
		startX: 0,
		startW: 0,
	});
	const drawerRef = React.useRef<HTMLElement>(null);

	// Restore persisted width on mount
	React.useEffect(() => {
		const saved = parseInt(localStorage.getItem('drawerWidth') ?? '0', 10);
		setWidth(clampDrawerWidth(saved >= MIN_DRAWER_WIDTH ? saved : DEFAULT_DRAWER_WIDTH));
	}, []);

	React.useEffect(() => {
		const onResize = () => setWidth((current) => clampDrawerWidth(current));
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	const isOpen = !!productHandle;

	// Keep the last-known handle alive through the exit animation so the drawer
	// slides out with content visible (not empty). Uses the derived-state pattern
	// so displayHandle is updated synchronously on open (no empty-frame flash).
	const [displayHandle, setDisplayHandle] = React.useState<string | null>(productHandle);
	const [prevProductHandle, setPrevProductHandle] = React.useState<string | null>(productHandle);
	if (productHandle !== prevProductHandle) {
		setPrevProductHandle(productHandle);
		if (productHandle) setDisplayHandle(productHandle);
	}

	// Clear displayHandle after exit animation completes
	React.useEffect(() => {
		if (!productHandle) {
			const t = setTimeout(() => setDisplayHandle(null), 400);
			return () => clearTimeout(t);
		}
	}, [productHandle]);

	// Pre-fetch product data so the drawer only animates open once content is ready,
	// preventing the skeleton flash. Same query key as DrawerBody so cache is shared.
	const { data: prefetchedProduct } = useQuery({
		queryKey: ['shopify', 'product', displayHandle ?? ''],
		queryFn: () => getProduct({ data: { handle: displayHandle! } }),
		enabled: !!displayHandle,
		initialData: getInitialProduct(displayHandle, initialProduct),
		staleTime: 5 * 60 * 1000,
	});

	// Delay the open animation until data is in cache. Close animates immediately.
	const isAnimatedOpen = isOpen && !!prefetchedProduct;

	const effectiveWidth = width;

	const navigateStep = React.useCallback(
		(dir: number) => {
			if (!productHandle || allHandles.length === 0) return;
			const idx = allHandles.indexOf(productHandle);
			const next = (idx + dir + allHandles.length) % allHandles.length;
			const nextHandle = allHandles[next];
			if (nextHandle) onChange(nextHandle);
		},
		[productHandle, allHandles, onChange],
	);

	// Keyboard nav
	React.useEffect(() => {
		if (!isOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
			if (e.key === 'ArrowRight') navigateStep(1);
			if (e.key === 'ArrowLeft') navigateStep(-1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [isOpen, onClose, navigateStep]);

	// Splitter drag
	const onSplitterMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		const currentW = drawerRef.current?.getBoundingClientRect().width ?? width;
		dragStateRef.current = { startX: e.clientX, startW: currentW };
		setIsDragging(true);
	};

	React.useEffect(() => {
		if (!isDragging) return;
		const onMove = (e: MouseEvent) => {
			const dx = dragStateRef.current.startX - e.clientX;
			const maxW = getDrawerMaxWidth();
			const next = Math.max(MIN_DRAWER_WIDTH, Math.min(maxW, dragStateRef.current.startW + dx));
			setWidth(Math.round(next));
		};
		const onUp = () => {
			setIsDragging(false);
			localStorage.setItem(
				'drawerWidth',
				String(drawerRef.current?.getBoundingClientRect().width ?? width),
			);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, [isDragging, width]);

	return (
		<>
			{/* Scrim */}
			<button
				type="button"
				aria-label="Close product drawer"
				tabIndex={isAnimatedOpen ? 0 : -1}
				onClick={onClose}
				className={twMerge(
					'fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-300',
					isAnimatedOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
				)}
			/>

			{/* Drawer */}
			<aside
				ref={drawerRef}
				aria-label="Product detail"
				aria-hidden={!isAnimatedOpen}
				style={{ width: effectiveWidth }}
				className={twMerge(
					'fixed top-[48px] right-0 bottom-0 z-[70]',
					'border-l border-shop-line flex flex-col',
					'shadow-[-30px_0_60px_-20px_rgba(0,0,0,0.5)]',
					'min-w-[320px] max-w-[100vw] md:max-w-[80vw]',
					isDragging
						? 'transition-none select-none'
						: 'transition-transform duration-[380ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]',
					isAnimatedOpen ? 'translate-x-0' : 'translate-x-full',
				)}
			>
				{/* Splitter handle */}
				<div
					role="separator"
					aria-label="Drag to resize drawer"
					onMouseDown={onSplitterMouseDown}
					onDoubleClick={() => {
						const next = clampDrawerWidth(DEFAULT_DRAWER_WIDTH);
						setWidth(next);
						localStorage.setItem('drawerWidth', String(next));
					}}
					className={twMerge(
						'absolute top-0 bottom-0 left-[-4px] w-2 z-[2] cursor-col-resize group',
						'hidden md:block',
					)}
				>
					{/* Thin line */}
					<div
						className={twMerge(
							'absolute left-[3px] top-0 bottom-0 w-[2px] transition-colors',
							isDragging ? 'bg-shop-accent' : 'bg-transparent group-hover:bg-shop-accent',
						)}
					/>
					{/* Grab pill */}
					<div
						className={twMerge(
							'absolute left-0 top-1/2 -translate-y-1/2 w-2 h-10 rounded bg-shop-panel border border-shop-line-2 transition-[opacity,border-color]',
							isDragging
								? 'opacity-100 border-shop-accent'
								: 'opacity-60 group-hover:opacity-100 group-hover:border-shop-accent',
						)}
					/>
				</div>

				{/* Width readout during drag */}
				{isDragging ? (
					<div className="absolute top-3 left-4 z-[3] font-shop-mono text-shop-xs text-shop-accent-ink bg-shop-accent px-1.5 py-[3px] rounded pointer-events-none">
						{width} px
					</div>
				) : null}

				{/* Close button — pinned to top-left of drawer, above scroll content */}
				<button
					type="button"
					aria-label="Close product detail"
					title="Close (Esc)"
					onClick={onClose}
					className="absolute top-3 left-3 z-[3] p-1 text-shop-muted hover:text-shop-text transition-colors"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
						<path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" />
					</svg>
				</button>

				{/* Body — keyed to productHandle so it resets on product change;
            displayHandle keeps it mounted through the exit animation */}
				{displayHandle ? (
					<DrawerBody
						key={productHandle ?? displayHandle}
						productHandle={displayHandle}
						initialProduct={prefetchedProduct}
					/>
				) : null}
			</aside>
		</>
	);
}

/* ─── Lazy-loaded drawer body ─────────────────────────────────────────── */

function DrawerBody({
	productHandle,
	initialProduct,
}: {
	productHandle: string;
	initialProduct?: ProductDetail | null;
}) {
	const { data: product, isLoading } = useQuery({
		queryKey: ['shopify', 'product', productHandle],
		queryFn: () => getProduct({ data: { handle: productHandle } }),
		initialData: getInitialProduct(productHandle, initialProduct),
		staleTime: 5 * 60 * 1000,
	});

	if (isLoading || !product) {
		return (
			<div className="shop-product-drawer-shell flex-1 overflow-y-auto">
				<div className="shop-product-drawer-layout">
					<div className="shop-product-drawer-media">
						<div className="shop-product-drawer-main-image aspect-square bg-shop-panel animate-pulse" />
					</div>
					<div className="shop-product-drawer-details bg-shop-bg p-5 flex flex-col gap-3">
						<div className="h-3 w-24 bg-shop-panel-2 rounded animate-pulse" />
						<div className="h-7 w-3/4 bg-shop-panel-2 rounded animate-pulse" />
						<div className="h-12 bg-shop-panel-2 rounded animate-pulse" />
						<div className="h-4 w-full bg-shop-panel-2 rounded animate-pulse" />
						<div className="h-4 w-4/5 bg-shop-panel-2 rounded animate-pulse" />
					</div>
				</div>
			</div>
		);
	}

	return <DrawerContent product={product} />;
}

/* ─── Full product content ────────────────────────────────────────────── */

function DrawerContent({ product }: { product: ProductDetail }) {
	const variants = product.variants.nodes;

	const [selected, setSelected] = React.useState<Record<string, string>>(() =>
		Object.fromEntries(product.options.map((o) => [o.name, ''])),
	);
	const [quantity, setQuantity] = React.useState(1);
	const [activeImageIndex, setActiveImageIndex] = React.useState(0);
	const [showAdded, setShowAdded] = React.useState(false);
	// heroOverride: set to variant image when user picks a color; cleared on thumbnail click
	const [heroOverride, setHeroOverride] = React.useState<(typeof product.images.nodes)[0] | null>(
		null,
	);

	// Exact variant for add-to-cart; wildcard findMatchingVariant used only for chip availability
	const selectedVariant = findExactVariant(variants, selected);
	// True once the user has explicitly picked every option (color, size, etc.)
	const isComplete = product.options
		.filter((o) => o.values.length > 1)
		.every((o) => !!selected[o.name]);

	// Sync hero image when color selection changes — uses wildcard match so image
	// updates immediately on color pick even before size is chosen.
	const variantForImage = findMatchingVariant(variants, selected);
	React.useEffect(() => {
		if (variantForImage?.image) setHeroOverride(variantForImage.image);
		else setHeroOverride(null);
	}, [variantForImage?.id, variantForImage?.image, variantForImage?.image?.url]);

	// Resolve which thumbnail index is "active" — match override url into the list
	const heroOverrideIndex = heroOverride
		? product.images.nodes.findIndex((img) => img.url === heroOverride.url)
		: -1;
	const activeThumbnailIndex = heroOverride ? heroOverrideIndex : activeImageIndex;
	const heroImage = heroOverride ?? product.images.nodes[activeImageIndex] ?? null;

	const displayPrice = selectedVariant?.price ?? variants[0]?.price ?? null;

	const addToCart = useAddToCart();
	const openCartDrawer = useCartDrawerStore((s) => s.openDrawer);

	React.useEffect(() => {
		if (!showAdded) return;
		const id = window.setTimeout(() => setShowAdded(false), 1500);
		return () => window.clearTimeout(id);
	}, [showAdded]);

	return (
		<div className="shop-product-drawer-shell flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--shop-line)_transparent]">
			<div className="shop-product-drawer-layout">
				{/* Hero image + vertical thumbnail strip */}
				<div className="shop-product-drawer-media relative">
					{/* Main image — leaves room for thumbnail strip when present */}
					<div
						className={`shop-product-drawer-main-image aspect-square bg-shop-bg/40 backdrop-blur-[20px] relative overflow-hidden p-6${product.images.nodes.length > 1 ? ' mr-[108px]' : ''}`}
					>
						{heroImage ? (
							<ProductImage
								image={heroImage}
								alt={product.title}
								width={1200}
								sizes="(min-width: 1120px) 60vw, (min-width: 768px) 520px, 100vw"
								loading="eager"
								className="w-full h-full object-cover"
							/>
						) : null}
					</div>

					{/* Vertical thumbnail strip — absolutely pinned so it scrolls within hero height */}
					{product.images.nodes.length > 1 ? (
						<div className="shop-product-drawer-thumbs absolute top-0 right-0 bottom-0 w-[108px] flex flex-col gap-1.5 px-[14px] py-[10px] overflow-y-auto [scrollbar-width:none] bg-shop-bg/40 backdrop-blur-[20px] border-l border-shop-line">
							{product.images.nodes.map((img, i) => (
								<button
									key={`${img.url}-${i}`}
									type="button"
									onClick={() => {
										setActiveImageIndex(i);
										setHeroOverride(null);
									}}
									aria-label={`View image ${i + 1}`}
									className={twMerge(
										'w-[80px] aspect-square rounded-md overflow-hidden transition-opacity shrink-0',
										i === activeThumbnailIndex
											? 'opacity-100 ring-1 ring-shop-line-2'
											: 'opacity-45 hover:opacity-75',
									)}
								>
									<ProductImage
										image={img}
										alt={`${product.title} — image ${i + 1}`}
										width={160}
										sizes="15vw"
										className="w-full h-full object-cover"
									/>
								</button>
							))}
						</div>
					) : null}
				</div>

				<div className="shop-product-drawer-details bg-shop-bg">
					<div className="mx-3 border-t border-shop-line" />

					{/* Title + price */}
					<div className="flex justify-between items-baseline gap-3 px-6 py-[15px]">
						<h2 className="font-shop-display font-semibold text-shop-heading leading-tight tracking-[-0.015em] text-shop-text">
							{product.title}
						</h2>
						{displayPrice ? (
							<ShopMono className="text-shop-price text-shop-text font-light whitespace-nowrap shrink-0">
								{formatMoney(displayPrice.amount, displayPrice.currencyCode)}
							</ShopMono>
						) : null}
					</div>

					{/* COLOR + SIZE + QUANTITY — all on one flex-wrap row */}
					<div className="flex flex-wrap gap-x-6 gap-y-5 items-start justify-start px-6 py-5">
						{product.options
							.filter((o) => o.values.length > 1)
							.map((option) => {
								const isSizeOption = /size/i.test(option.name);
								const shouldUseSelect = option.values.length > MAX_INLINE_OPTION_VALUES;

								if (shouldUseSelect) {
									return (
										<div key={option.id} className="shop-product-option flex flex-col gap-3">
											<span className="font-shop-mono italic text-shop-sm text-shop-muted uppercase tracking-[0.1em]">
												{option.name}
											</span>
											<ShopSelect
												value={selected[option.name]}
												className="w-full"
												triggerClassName="w-full justify-between rounded-full px-4 py-2 text-shop-sm"
												onChange={(e) =>
													setSelected({
														...selected,
														[option.name]: e.target.value,
													})
												}
											>
												<option value="" disabled>
													Select {option.name}
												</option>
												{option.values.map((value) => {
													const match = findMatchingVariant(variants, {
														...selected,
														[option.name]: value,
													});
													return (
														<option key={value} value={value} disabled={!match?.availableForSale}>
															{value}
														</option>
													);
												})}
											</ShopSelect>
										</div>
									);
								}

								if (isSizeOption) {
									return (
										<div key={option.id} className="shop-product-option flex flex-col gap-3">
											<span className="font-shop-mono italic text-shop-sm text-shop-muted uppercase tracking-[0.1em]">
												{option.name}
											</span>
											<div className="flex flex-wrap gap-1.5">
												{option.values.map((value) => {
													const isSelected = selected[option.name] === value;
													const match = findMatchingVariant(variants, {
														...selected,
														[option.name]: value,
													});
													const isUnavailable = !match?.availableForSale;
													return (
														<button
															key={value}
															type="button"
															aria-pressed={isSelected}
															disabled={isUnavailable}
															onClick={() =>
																setSelected({
																	...selected,
																	[option.name]: value,
																})
															}
															className={twMerge(
																'px-4 py-2 font-shop-mono text-shop-sm leading-none whitespace-nowrap',
																'rounded-full border transition-[background-color,color,border-color] duration-150',
																isSelected
																	? 'bg-shop-text text-shop-bg border-shop-text'
																	: 'bg-shop-surface text-shop-text border-shop-line hover:enabled:bg-shop-surface-hover hover:enabled:border-shop-line-2',
																isUnavailable &&
																	!isSelected &&
																	'opacity-40 cursor-not-allowed line-through',
															)}
														>
															{value}
														</button>
													);
												})}
											</div>
										</div>
									);
								}

								// Color / other options
								return (
									<div key={option.id} className="shop-product-option flex flex-col gap-3">
										<span className="font-shop-mono italic text-shop-sm text-shop-muted uppercase tracking-[0.1em]">
											{option.name}
										</span>
										<div className="flex flex-wrap gap-1.5">
											{option.values.map((value) => {
												const isSelected = selected[option.name] === value;
												const match = findMatchingVariant(variants, {
													...selected,
													[option.name]: value,
												});
												const isUnavailable = !match?.availableForSale;
												const hex = resolveColorHex(value);
												return (
													<button
														key={value}
														type="button"
														aria-pressed={isSelected}
														disabled={isUnavailable}
														onClick={() => setSelected({ ...selected, [option.name]: value })}
														style={
															isSelected && hex
																? {
																		backgroundColor: hex,
																		...(isDarkColor(hex)
																			? {
																					boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.25)',
																				}
																			: {}),
																	}
																: undefined
														}
														className={twMerge(
															'px-4 py-2 font-shop-mono text-shop-sm leading-none whitespace-nowrap',
															'rounded-full border transition-[background-color,color,border-color] duration-150',
															isSelected && !hex
																? 'bg-shop-accent text-shop-accent-ink border-shop-accent'
																: isSelected && hex && isDarkColor(hex)
																	? 'text-white border-transparent'
																	: isSelected && hex
																		? 'text-shop-text border-transparent'
																		: 'bg-shop-surface text-shop-text border-shop-line hover:enabled:bg-shop-surface-hover hover:enabled:border-shop-line-2',
															isUnavailable &&
																!isSelected &&
																'opacity-40 cursor-not-allowed line-through',
														)}
													>
														{value}
													</button>
												);
											})}
										</div>
									</div>
								);
							})}

						{/* Quantity pill */}
						<div className="shop-product-quantity flex flex-col gap-3 shrink-0">
							<span className="font-shop-mono italic text-shop-sm text-shop-muted uppercase tracking-[0.1em]">
								Quantity
							</span>
							<div className="bg-shop-surface flex h-[38px] items-center justify-center gap-4 px-4 rounded-full w-[100px] font-shop-mono select-none">
								<button
									type="button"
									onClick={() => setQuantity((q) => q + 1)}
									aria-label="Increase quantity"
									className="text-shop-sm text-shop-text-2 leading-none hover:text-shop-text transition-colors"
								>
									+
								</button>
								<span className="text-shop-sm text-shop-text min-w-[1ch] text-center">
									{quantity}
								</span>
								<button
									type="button"
									onClick={() => setQuantity((q) => Math.max(1, q - 1))}
									aria-label="Decrease quantity"
									className="text-shop-sm text-shop-text-2 leading-none hover:text-shop-text transition-colors"
								>
									−
								</button>
							</div>
						</div>
					</div>

					<div className="mx-3 border-t border-shop-line" />

					{/* Add to Cart */}
					<div className="flex flex-col items-center px-6 py-5">
						<button
							type="button"
							disabled={
								!isComplete ||
								!selectedVariant?.availableForSale ||
								(addToCart.isPending && !showAdded)
							}
							onClick={() => {
								if (!selectedVariant) return;
								setShowAdded(true);
								openCartDrawer();
								addToCart.mutate({
									variantId: selectedVariant.id,
									quantity,
									line: {
										productTitle: product.title,
										productHandle: product.handle,
										variantTitle: selectedVariant.title,
										price: selectedVariant.price,
										image: selectedVariant.image,
										selectedOptions: selectedVariant.selectedOptions,
									},
								});
							}}
							style={
								isComplete && !showAdded && selectedVariant?.availableForSale
									? {
											backgroundImage:
												'linear-gradient(235.54deg, rgba(116,220,255,0.99) 3.4%, rgba(255,242,124,0.99) 13.1%, rgba(255,160,92,0.99) 27.1%, rgba(255,95,95,0.99) 39.5%)',
											backgroundSize: '200% 200%',
											animation:
												'shop-cta-gradient 12s ease infinite, shop-cta-rotate 30s linear infinite',
										}
									: undefined
							}
							className={twMerge(
								'w-full max-w-[760px] rounded-full px-4 py-3 flex items-center justify-center gap-2.5',
								'font-shop-display font-semibold text-shop-title',
								'transition-[background-color,color,border-color,opacity] duration-500',
								isComplete && !showAdded && selectedVariant?.availableForSale
									? 'hover:enabled:brightness-105 text-black'
									: isComplete && !selectedVariant?.availableForSale
										? 'bg-shop-surface text-shop-muted border border-shop-line'
										: 'bg-shop-surface/30 border border-shop-line text-shop-muted cursor-not-allowed',
							)}
						>
							{isComplete && !showAdded && selectedVariant?.availableForSale ? (
								<svg
									width="22"
									height="22"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.75"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden
								>
									<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
									<path d="M3 6h18" />
									<path d="M16 10a4 4 0 01-8 0" />
								</svg>
							) : null}
							{showAdded
								? '✓ Added'
								: !isComplete
									? 'Add to Cart'
									: !selectedVariant?.availableForSale
										? 'Sold out'
										: 'Add to Cart'}
						</button>
					</div>

					<div className="mx-3 border-t border-shop-line" />

					{/* Description */}
					{product.descriptionHtml ? (
						<div className="flex flex-col gap-2.5 px-6 py-4">
							<span className="font-shop-mono italic text-shop-sm text-shop-muted uppercase tracking-[0.1em]">
								Description
							</span>
							<div
								className="text-shop-body text-shop-text-2 leading-[1.6] [&_p]:mb-2 [&_p:last-child]:mb-0"
								dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
							/>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
