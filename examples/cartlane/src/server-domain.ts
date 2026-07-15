import type {
	CartLine,
	CheckoutRequest,
	CheckoutState,
	FieldErrors,
	OrderReceipt,
} from './domain.ts';
import { PRODUCTS, orderTotal } from './domain.ts';

interface SavedOrder {
	receipt: OrderReceipt;
	submissionCount: number;
}

type UnverifiedCheckoutRequest = Omit<CheckoutRequest, 'lines'> & { lines: unknown };

const ordersByKey = new Map<string, SavedOrder>();

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stableOrderId(key: string): string {
	let hash = 2166136261;
	for (const character of key) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `CL-${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
}

function normalizeRequest(value: unknown): UnverifiedCheckoutRequest | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		typeof record.idempotencyKey !== 'string' ||
		record.idempotencyKey.length < 1 ||
		record.idempotencyKey.length > 128 ||
		record.idempotencyKey.trim() !== record.idempotencyKey
	) {
		return null;
	}
	return {
		idempotencyKey: record.idempotencyKey,
		lines: record.lines,
		name: typeof record.name === 'string' ? record.name : '',
		email: typeof record.email === 'string' ? record.email : '',
		address: typeof record.address === 'string' ? record.address : '',
		city: typeof record.city === 'string' ? record.city : '',
		postalCode: typeof record.postalCode === 'string' ? record.postalCode : '',
		cardNumber: typeof record.cardNumber === 'string' ? record.cardNumber : '',
		agreeToTerms: record.agreeToTerms === true,
	};
}

function validate(request: UnverifiedCheckoutRequest): FieldErrors {
	const errors: FieldErrors = {};
	if (request.name.trim().length < 2) {
		errors.name = 'Enter the name shown on the delivery address.';
	}
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(request.email)) {
		errors.email = 'Enter a valid email address.';
	}
	if (request.address.trim().length < 5) {
		errors.address = 'Enter a street address.';
	}
	if (request.city.trim().length < 2) {
		errors.city = 'Enter a town or city.';
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(request.postalCode.trim())) {
		errors.postalCode = 'Enter a valid postal code.';
	}
	if (!/^\d{16}$/.test(request.cardNumber.replace(/\s/g, ''))) {
		errors.cardNumber = 'Use the 16-digit fixture card number.';
	}
	if (!request.agreeToTerms) errors.agreeToTerms = 'Accept the store terms to continue.';
	return errors;
}

function verifyCart(value: unknown): CartLine[] | null {
	if (!Array.isArray(value) || value.length > PRODUCTS.length) return null;
	const productIds = new Set(PRODUCTS.map((product) => product.id));
	const seen = new Set<string>();
	const lines: CartLine[] = [];
	for (const candidate of value) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
		const record = candidate as Record<string, unknown>;
		if (
			typeof record.productId !== 'string' ||
			!productIds.has(record.productId) ||
			seen.has(record.productId) ||
			typeof record.quantity !== 'number' ||
			!Number.isInteger(record.quantity) ||
			record.quantity < 1 ||
			record.quantity > 8
		) {
			return null;
		}
		seen.add(record.productId);
		lines.push({ productId: record.productId, quantity: record.quantity });
	}
	return lines;
}

export async function commitOrder(value: unknown): Promise<CheckoutState> {
	// This delay is deliberately deterministic so the browser can observe native
	// form pending state and safely queue a second submit behind the first.
	await delay(280);

	const unverifiedRequest = normalizeRequest(value);
	if (unverifiedRequest === null) {
		return {
			status: 'failure',
			message: 'The checkout request could not be verified. Retry without being charged.',
			recoverable: true,
		};
	}

	const request = unverifiedRequest;
	const existing = ordersByKey.get(request.idempotencyKey);
	if (existing) {
		existing.submissionCount += 1;
		return {
			status: 'success',
			message: 'Duplicate request safely reused the original order.',
			order: existing.receipt,
			duplicate: true,
			submissionCount: existing.submissionCount,
		};
	}

	const errors = validate(request);
	if (Object.keys(errors).length > 0) {
		return { status: 'invalid', message: 'Check the highlighted details.', errors };
	}
	const verifiedLines = verifyCart(request.lines);
	if (verifiedLines === null) {
		return {
			status: 'failure',
			message: 'The basket could not be verified. Review it and retry without being charged.',
			recoverable: true,
		};
	}
	if (verifiedLines.length === 0) {
		return {
			status: 'failure',
			message: 'Your basket is empty. Add an item before checking out.',
			recoverable: true,
		};
	}
	if (request.cardNumber.replace(/\s/g, '') === '4000000000000000') {
		return {
			status: 'failure',
			message: 'The fixture bank declined this card. Use 4242 4242 4242 4242 and retry.',
			recoverable: true,
		};
	}

	const lineCount = verifiedLines.reduce((sum, line) => sum + line.quantity, 0);
	const receipt: OrderReceipt = {
		id: stableOrderId(request.idempotencyKey),
		placedAt: '15 July 2026, 14:30',
		lineCount,
		totalCents: orderTotal(verifiedLines),
		email: request.email,
		deliveryLabel: `${request.city.trim()}, ${request.postalCode.trim().toUpperCase()}`,
	};
	ordersByKey.set(request.idempotencyKey, { receipt, submissionCount: 1 });

	return {
		status: 'success',
		message: 'Order placed once and confirmed by Cartlane.',
		order: receipt,
		duplicate: false,
		submissionCount: 1,
	};
}
