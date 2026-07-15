export type Category = 'Desk' | 'Travel' | 'Home';

export interface Product {
	id: string;
	name: string;
	category: Category;
	priceCents: number;
	tagline: string;
	description: string;
	glyph: string;
	accent: string;
	badge?: string;
}

export interface CartLine {
	productId: string;
	quantity: number;
}

export interface CheckoutRequest {
	idempotencyKey: string;
	lines: CartLine[];
	name: string;
	email: string;
	address: string;
	city: string;
	postalCode: string;
	cardNumber: string;
	agreeToTerms: boolean;
}

export interface FieldErrors {
	name?: string;
	email?: string;
	address?: string;
	city?: string;
	postalCode?: string;
	cardNumber?: string;
	agreeToTerms?: string;
}

export interface OrderReceipt {
	id: string;
	placedAt: string;
	lineCount: number;
	totalCents: number;
	email: string;
	deliveryLabel: string;
}

export type CheckoutState =
	| { status: 'idle'; message: string }
	| { status: 'invalid'; message: string; errors: FieldErrors }
	| { status: 'failure'; message: string; recoverable: boolean }
	| {
			status: 'success';
			message: string;
			order: OrderReceipt;
			duplicate: boolean;
			submissionCount: number;
	  };

export type Route =
	| { name: 'catalog' }
	| { name: 'product'; productId: string }
	| { name: 'cart' }
	| { name: 'checkout' }
	| { name: 'order'; orderId: string };

export const PRODUCTS: readonly Product[] = [
	{
		id: 'arc-lamp',
		name: 'Arc task lamp',
		category: 'Desk',
		priceCents: 8900,
		tagline: 'Warm light, exactly where the work is.',
		description:
			'A dimmable, counterbalanced desk light with a weighted mineral base and a soft-touch brass switch.',
		glyph: '◒',
		accent: '#e7b06c',
		badge: 'Bestseller',
	},
	{
		id: 'field-notes',
		name: 'Field notes folio',
		category: 'Travel',
		priceCents: 3600,
		tagline: 'Ideas travel better on paper.',
		description:
			'Vegetable-tanned folio, two replaceable notebooks, and a slim brass pencil for plans made away from a screen.',
		glyph: '▤',
		accent: '#d48873',
	},
	{
		id: 'drift-mug',
		name: 'Drift stoneware mug',
		category: 'Home',
		priceCents: 2800,
		tagline: 'A quiet start, held comfortably.',
		description:
			'Hand-finished speckled stoneware with a thumb-rest handle and a satin sea-glass glaze.',
		glyph: '◓',
		accent: '#77a6a1',
	},
	{
		id: 'orbit-tray',
		name: 'Orbit catchall tray',
		category: 'Desk',
		priceCents: 4400,
		tagline: 'A landing place for daily essentials.',
		description:
			'Spun aluminium and cork create a low-profile home for keys, earbuds, watches, and the things pockets collect.',
		glyph: '◎',
		accent: '#8394b5',
	},
	{
		id: 'weekender',
		name: 'Canvas weekender',
		category: 'Travel',
		priceCents: 14800,
		tagline: 'Two nights, one beautifully simple bag.',
		description:
			'Waxed organic canvas, an easy-access shoe compartment, and repairable solid-brass hardware.',
		glyph: '▰',
		accent: '#b38b69',
		badge: 'Small batch',
	},
	{
		id: 'linen-throw',
		name: 'Washed linen throw',
		category: 'Home',
		priceCents: 9600,
		tagline: 'Soft structure for slow afternoons.',
		description:
			'Heavy European linen, garment washed for softness and finished with a hand-knotted fringe.',
		glyph: '≋',
		accent: '#b18fa4',
	},
];

export const INITIAL_CHECKOUT_STATE: CheckoutState = {
	status: 'idle',
	message: 'Your payment details are encrypted before they leave this page.',
};

export function getProduct(productId: string): Product | undefined {
	return PRODUCTS.find((product) => product.id === productId);
}

export function formatMoney(cents: number): string {
	return new Intl.NumberFormat('en-GB', {
		style: 'currency',
		currency: 'GBP',
		minimumFractionDigits: 0,
		maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
	}).format(cents / 100);
}

export function clampQuantity(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.max(1, Math.min(8, Math.floor(value)));
}

export function addCartLine(
	lines: readonly CartLine[],
	productId: string,
	quantity = 1,
): CartLine[] {
	const existing = lines.find((line) => line.productId === productId);
	if (!existing) return [...lines, { productId, quantity: clampQuantity(quantity) }];
	return lines.map((line) =>
		line.productId === productId
			? { ...line, quantity: clampQuantity(line.quantity + quantity) }
			: line,
	);
}

export function updateCartLine(
	lines: readonly CartLine[],
	productId: string,
	quantity: number,
): CartLine[] {
	if (quantity <= 0) return lines.filter((line) => line.productId !== productId);
	return lines.map((line) =>
		line.productId === productId ? { ...line, quantity: clampQuantity(quantity) } : line,
	);
}

export function cartCount(lines: readonly CartLine[]): number {
	return lines.reduce((total, line) => total + line.quantity, 0);
}

export function cartSubtotal(lines: readonly CartLine[]): number {
	return lines.reduce((total, line) => {
		const product = getProduct(line.productId);
		return total + (product?.priceCents ?? 0) * line.quantity;
	}, 0);
}

export function deliveryCost(subtotal: number): number {
	return subtotal >= 12000 || subtotal === 0 ? 0 : 600;
}

export function orderTotal(lines: readonly CartLine[]): number {
	const subtotal = cartSubtotal(lines);
	return subtotal + deliveryCost(subtotal);
}

export function routeFromUrl(value: string): Route {
	const url = new URL(value, 'https://cartlane.local');
	const parts = url.pathname.split('/').filter(Boolean);
	if (parts[0] === 'products' && parts[1]) return { name: 'product', productId: parts[1] };
	if (parts[0] === 'cart') return { name: 'cart' };
	if (parts[0] === 'checkout') return { name: 'checkout' };
	if (parts[0] === 'orders' && parts[1]) return { name: 'order', orderId: parts[1] };
	return { name: 'catalog' };
}

export function readStoredCart(value: string | null): CartLine[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		const lines: CartLine[] = [];
		for (const candidate of parsed) {
			if (!candidate || typeof candidate !== 'object') continue;
			const record = candidate as Record<string, unknown>;
			if (typeof record.productId !== 'string' || !getProduct(record.productId)) continue;
			if (typeof record.quantity !== 'number') continue;
			lines.push({ productId: record.productId, quantity: clampQuantity(record.quantity) });
		}
		return lines;
	} catch {
		return [];
	}
}

export function readStoredOrder(value: string | null): OrderReceipt | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object') return null;
		const record = parsed as Record<string, unknown>;
		if (
			typeof record.id !== 'string' ||
			typeof record.placedAt !== 'string' ||
			typeof record.lineCount !== 'number' ||
			typeof record.totalCents !== 'number' ||
			typeof record.email !== 'string' ||
			typeof record.deliveryLabel !== 'string'
		) {
			return null;
		}
		return record as unknown as OrderReceipt;
	} catch {
		return null;
	}
}
