import { expect, test, type Page, type Response } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';
import { CHECKOUT_CITY_MAX_LENGTH, CHECKOUT_EMAIL_MAX_LENGTH } from '../src/domain.ts';

const diagnosticsByPage = new WeakMap<Page, BrowserDiagnostics>();

function isSameOriginPost(response: Response, origin: string): boolean {
	return response.request().method() === 'POST' && new URL(response.url()).origin === origin;
}

test.beforeEach(async ({ page }) => {
	diagnosticsByPage.set(
		page,
		collectBrowserDiagnostics(page, {
			failOnHydrationWarnings: true,
		}),
	);
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = diagnosticsByPage.get(page);
	if (diagnostics === undefined) return;
	try {
		await settleBrowserFrames(page);
		diagnostics.assertClean(testInfo.title);
	} finally {
		diagnostics.stop();
	}
});

async function addProduct(page: Page, productId = 'arc-lamp', quantity = 1): Promise<void> {
	await page.goto(`/products/${productId}`);
	await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
	const quantityInput = page.getByRole('spinbutton', { name: 'Quantity' });
	await quantityInput.fill(String(quantity));
	await page.getByRole('button', { name: 'Add to basket' }).click();
	await expect(page.getByRole('button', { name: 'Dismiss basket notice' })).toBeVisible();
}

async function openCheckout(page: Page, productId = 'arc-lamp', quantity = 1): Promise<void> {
	await addProduct(page, productId, quantity);
	await page.getByRole('link', { name: new RegExp(`Basket, ${quantity} item`) }).click();
	await expect(page.getByRole('heading', { name: 'Basket', level: 1 })).toBeVisible();
	await page.getByRole('link', { name: 'Continue to checkout' }).click();
	await expect(page.getByRole('heading', { name: 'Where should we send it?' })).toBeVisible();
}

async function fillValidCheckout(page: Page, cardNumber = '4242 4242 4242 4242'): Promise<void> {
	await page.getByRole('textbox', { name: 'Full name' }).fill('Mara Finch');
	await page.getByRole('textbox', { name: 'Email address' }).fill('mara@example.test');
	await page.getByRole('textbox', { name: 'Street address' }).fill('18 Bramble Lane');
	await page.getByRole('textbox', { name: 'Town or city' }).fill('Bristol');
	await page.getByRole('textbox', { name: 'Postal code' }).fill('BS1 4ST');
	await page.getByRole('textbox', { name: 'Card number' }).fill(cardNumber);
	await page.getByRole('checkbox', { name: 'I agree to the Cartlane fixture terms.' }).check();
}

test('adopts a deep-linked product without losing pre-hydration quantity and adds it by keyboard', async ({
	page,
}) => {
	await page.addInitScript(() => {
		const observer = new MutationObserver(() => {
			const input = document.querySelector<HTMLInputElement>('input[name="quantity"]');
			if (input && !(window as Window & { cartlaneServerInput?: Element }).cartlaneServerInput) {
				(window as Window & { cartlaneServerInput?: Element }).cartlaneServerInput = input;
			}
		});
		observer.observe(document, { childList: true, subtree: true });
	});

	await page.goto('/products/arc-lamp?hydrateDelay=650', { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { name: 'Arc task lamp', level: 1 })).toBeVisible();
	await expect(page.locator('[data-hydrated="false"]')).toBeVisible();
	const artworkLabel = page.locator('.product-detail .product-art__label');
	await expect(artworkLabel).toHaveText('Cartlane / 01');
	const quantity = page.getByRole('spinbutton', { name: 'Quantity' });
	await quantity.fill('3');
	await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
	expect(
		await quantity.evaluate(
			(element) =>
				(window as Window & { cartlaneServerInput?: Element }).cartlaneServerInput === element,
		),
	).toBe(true);
	await expect(quantity).toHaveValue('3');

	await page.evaluate(() => {
		history.pushState(null, '', '/products/field-notes');
		window.dispatchEvent(new PopStateEvent('popstate'));
	});
	await expect(page.getByRole('heading', { name: 'Field notes folio', level: 1 })).toBeVisible();
	await expect(artworkLabel).toHaveText('Cartlane / 02');
	await expect(page.locator('input[name="productId"]')).toHaveValue('field-notes');
	await expect(quantity).toHaveValue('1');
	await page.goBack();
	await expect(page.getByRole('heading', { name: 'Arc task lamp', level: 1 })).toBeVisible();
	await quantity.fill('3');
	await quantity.focus();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Add to basket' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByText('Arc task lamp added to your basket.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Basket, 3 items' })).toBeVisible();

	await page.getByRole('link', { name: 'Basket, 3 items' }).click();
	await expect(page.getByRole('heading', { name: 'Basket', level: 1 })).toBeVisible();
	await expect(page.getByLabel('Quantity for Arc task lamp')).toHaveText('3');
	await expect(page.locator('[data-cart-product="arc-lamp"]').getByText('£267')).toBeVisible();
});

test('recovers the collection, handles an empty filter, and keeps the mobile basket usable offline', async ({
	page,
	context,
}) => {
	await page.addInitScript(() => {
		const cartKey = 'cartlane:cart:v1';
		const orderKey = 'cartlane:last-order:v1';
		const originalGetItem = Storage.prototype.getItem;
		const originalSetItem = Storage.prototype.setItem;
		originalSetItem.call(
			window.localStorage,
			cartKey,
			JSON.stringify([
				{ productId: 'field-notes', quantity: 1 },
				{ productId: 'field-notes', quantity: 1 },
			]),
		);
		Storage.prototype.getItem = function (key) {
			if (this === window.localStorage && key === orderKey) {
				throw new DOMException('Fixture storage read unavailable', 'SecurityError');
			}
			return originalGetItem.call(this, key);
		};
		Storage.prototype.setItem = function (key, value) {
			if (this === window.localStorage && key === cartKey) {
				throw new DOMException('Fixture storage write unavailable', 'QuotaExceededError');
			}
			return originalSetItem.call(this, key, value);
		};
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/?scenario=catalog-failure');
	await expect(page.getByRole('status').getByText('Opening the collection…')).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('The stockroom did not answer.');
	await page.getByRole('button', { name: 'Retry collection' }).click();
	await expect(page.locator('[data-product-id]')).toHaveCount(6);

	await page.getByRole('searchbox', { name: 'Search products' }).fill('no such useful thing');
	await expect(
		page.getByRole('heading', { name: 'Nothing in this edition matches that search.' }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await page.getByRole('combobox', { name: 'Filter by category' }).selectOption('Travel');
	await expect(page.locator('[data-product-id]')).toHaveCount(2);
	await page
		.locator('[data-product-id="field-notes"]')
		.getByRole('button', { name: 'Add' })
		.click();
	await expect(page.getByRole('link', { name: 'Basket, 3 items' })).toBeVisible();

	await context.setOffline(true);
	await expect(page.getByText('You are offline.')).toBeVisible();
	await page.getByRole('link', { name: 'Basket, 3 items' }).click();
	await expect(page.getByRole('heading', { name: 'Basket', level: 1 })).toBeVisible();
	await expect(page.locator('[data-cart-product="field-notes"]')).toHaveCount(1);
	const restoredQuantity = page.getByLabel('Quantity for Field notes folio');
	await expect(restoredQuantity).toHaveText('3');
	await expect(page.locator('.summary-total')).toContainText('£114');

	await page.locator('.quantity-form').evaluate((form) => {
		const unknownSubmitter = document.createElement('button');
		unknownSubmitter.type = 'submit';
		unknownSubmitter.name = 'intent';
		unknownSubmitter.value = 'unexpected';
		form.append(unknownSubmitter);
		(form as HTMLFormElement).requestSubmit(unknownSubmitter);
		unknownSubmitter.remove();
	});

	await page.getByRole('button', { name: 'Increase Field notes folio quantity' }).click();
	await expect(restoredQuantity).toHaveText('4');
	await expect(page.getByRole('link', { name: 'Basket, 4 items' })).toBeVisible();
	await expect(page.locator('.summary-total')).toContainText('£144');
	await expect(page.locator('.offline-banner')).toContainText(
		'Your basket is available; checkout will wait for a connection.',
	);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
});

test('validates the native checkout form, exposes pending status, and calls the production server function', async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.sessionStorage.setItem('cartlane:checkout-key:v1', ' invalid checkout key ');
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await openCheckout(page, 'drift-mug');
	await expect(page.getByRole('navigation', { name: 'Checkout progress' })).toHaveText(
		/Basket—Details—Confirmed/,
	);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);

	await page.getByRole('button', { name: 'Place order securely' }).click();
	await expect(page.getByRole('alert')).toContainText('Check the highlighted details.');
	await expect(page.getByText('Enter a valid email address.')).toBeVisible();
	await expect(page.getByText('Accept the store terms to continue.')).toBeVisible();
	for (const control of [
		page.getByRole('textbox', { name: 'Full name' }),
		page.getByRole('textbox', { name: 'Email address' }),
		page.getByRole('textbox', { name: 'Street address' }),
		page.getByRole('textbox', { name: 'Town or city' }),
		page.getByRole('textbox', { name: 'Postal code' }),
		page.getByRole('textbox', { name: 'Card number' }),
		page.getByRole('checkbox', { name: 'I agree to the Cartlane fixture terms.' }),
	]) {
		await expect(control).toHaveAttribute('aria-invalid', 'true');
	}

	const fullName = page.getByRole('textbox', { name: 'Full name' });
	const email = page.getByRole('textbox', { name: 'Email address' });
	const address = page.getByRole('textbox', { name: 'Street address' });
	const city = page.getByRole('textbox', { name: 'Town or city' });
	const postalCode = page.getByRole('textbox', { name: 'Postal code' });
	const cardNumber = page.getByRole('textbox', { name: 'Card number' });
	const terms = page.getByRole('checkbox', { name: 'I agree to the Cartlane fixture terms.' });
	const submit = page.getByRole('button', { name: 'Place order securely' });
	const emailSuffix = '@example.test';
	const boundaryEmail = 'm'.repeat(CHECKOUT_EMAIL_MAX_LENGTH - emailSuffix.length) + emailSuffix;
	const boundaryCity = 'B'.repeat(CHECKOUT_CITY_MAX_LENGTH);
	expect(boundaryEmail).toHaveLength(CHECKOUT_EMAIL_MAX_LENGTH);
	expect(boundaryCity).toHaveLength(CHECKOUT_CITY_MAX_LENGTH);
	await expect(email).toHaveAttribute('maxlength', String(CHECKOUT_EMAIL_MAX_LENGTH));
	await expect(city).toHaveAttribute('maxlength', String(CHECKOUT_CITY_MAX_LENGTH));

	await fullName.focus();
	await page.keyboard.type('Mara Finch');
	await page.keyboard.press('Tab');
	await expect(email).toBeFocused();
	await page.keyboard.type(boundaryEmail);
	await page.keyboard.press('Tab');
	await expect(address).toBeFocused();
	await page.keyboard.type('18 Bramble Lane');
	await page.keyboard.press('Tab');
	await expect(city).toBeFocused();
	await page.keyboard.type(boundaryCity);
	await page.keyboard.press('Tab');
	await expect(postalCode).toBeFocused();
	await page.keyboard.type('BS1 4ST');
	await page.keyboard.press('Tab');
	await expect(cardNumber).toBeFocused();
	await page.keyboard.type('4242 4242 4242 4242');
	await page.keyboard.press('Tab');
	await expect(terms).toBeFocused();
	await page.keyboard.press('Space');
	await page.keyboard.press('Tab');
	await expect(submit).toBeFocused();

	const checkoutOrigin = new URL(page.url()).origin;
	const cartPayload = page.locator('input[name="cart"]');
	const validCartPayload = await cartPayload.inputValue();
	await cartPayload.evaluate((input) => {
		(input as HTMLInputElement).value = '{';
	});
	const rejectedPost = page.waitForResponse((response) =>
		isSameOriginPost(response, checkoutOrigin),
	);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Placing your order…' })).toBeVisible();
	await expect(page.locator('.checkout-form-wrap')).toHaveAttribute('aria-busy', 'true');
	await expect(
		page.getByText('Your native form action is crossing the Cartlane server boundary.'),
	).toBeVisible();
	expect((await rejectedPost).status()).toBe(200);
	await expect(page.getByRole('alert')).toContainText(
		'The basket could not be verified. Review it and retry without being charged.',
	);
	await expect(page).toHaveURL(/\/checkout$/);
	await expect(page.locator('[data-order-id]')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Basket, 1 item' })).toBeVisible();
	await expect(fullName).toHaveValue('Mara Finch');

	await cartPayload.evaluate((input) => {
		(input as HTMLInputElement).value = JSON.stringify([{ productId: 'weekender', quantity: -2 }]);
	});
	const invalidLinePost = page.waitForResponse((response) =>
		isSameOriginPost(response, checkoutOrigin),
	);
	await submit.focus();
	await page.keyboard.press('Enter');
	expect((await invalidLinePost).status()).toBe(200);
	await expect(page.getByRole('alert')).toContainText(
		'The basket could not be verified. Review it and retry without being charged.',
	);

	await cartPayload.evaluate((input, value) => {
		(input as HTMLInputElement).value = value;
	}, validCartPayload);
	await page.evaluate(() => {
		const scope = window as Window & { cartlaneOriginalSetItem?: Storage['setItem'] };
		const originalSetItem = Storage.prototype.setItem;
		scope.cartlaneOriginalSetItem = originalSetItem;
		Storage.prototype.setItem = function (key, value) {
			if (this === window.sessionStorage && key === 'cartlane:checkout-key:v1') {
				throw new DOMException('Fixture session write unavailable', 'QuotaExceededError');
			}
			return originalSetItem.call(this, key, value);
		};
	});
	await submit.focus();
	const acceptedPost = page.waitForResponse((response) =>
		isSameOriginPost(response, checkoutOrigin),
	);
	await page.keyboard.press('Enter');
	expect((await acceptedPost).status()).toBe(200);

	await expect(page).toHaveURL(/\/orders\/CL-[A-Z0-9]+$/);
	await expect(
		page.getByRole('heading', { name: 'Thank you. It is in good hands.' }),
	).toBeVisible();
	await expect(page.getByText('Paid once').locator('..')).toContainText('£34');
	const orderId = await page.locator('[data-order-id]').getAttribute('data-order-id');
	await page.evaluate(() => {
		const scope = window as Window & { cartlaneOriginalSetItem?: Storage['setItem'] };
		if (scope.cartlaneOriginalSetItem) {
			Storage.prototype.setItem = scope.cartlaneOriginalSetItem;
			delete scope.cartlaneOriginalSetItem;
		}
		window.sessionStorage.removeItem('cartlane:checkout-key:v1');
	});
	await page.reload();
	await expect(page.locator(`[data-order-id="${orderId}"]`)).toBeVisible();
	await expect(page.getByRole('heading', { name: orderId ?? '', level: 2 })).toBeVisible();
	await expect(page.locator('.confirmation__lede')).toContainText(boundaryEmail);
	await expect(page.getByText('Delivering to').locator('..')).toContainText(
		`${boundaryCity}, BS1 4ST`,
	);
	await page.evaluate(() => {
		const key = 'cartlane:last-order:v1';
		const receipt = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Record<
			string,
			unknown
		> | null;
		if (receipt === null) throw new Error('expected a stored receipt');
		receipt.lineCount = 1.5;
		receipt.totalCents = -100;
		window.localStorage.setItem(key, JSON.stringify(receipt));
	});
	await page.reload();
	await expect(
		page.getByRole('heading', { name: 'We could not find that order on this device.' }),
	).toBeVisible();
});

test('queues rapid native submits and idempotently resolves them to one order', async ({
	page,
}) => {
	await openCheckout(page, 'weekender');
	await fillValidCheckout(page);
	const checkoutOrigin = new URL(page.url()).origin;
	let checkoutPosts = 0;
	page.on('response', (response) => {
		if (isSameOriginPost(response, checkoutOrigin)) checkoutPosts += 1;
	});

	await page.locator('[data-checkout-form="true"]').evaluate((form) => {
		const checkoutForm = form as HTMLFormElement;
		const cardNumber = checkoutForm.elements.namedItem('cardNumber');
		const cart = checkoutForm.elements.namedItem('cart');
		if (!(cardNumber instanceof HTMLInputElement) || !(cart instanceof HTMLInputElement)) {
			throw new Error('expected checkout inputs');
		}
		checkoutForm.requestSubmit();
		cardNumber.value = '4000 0000 0000 0000';
		checkoutForm.requestSubmit();
		cardNumber.value = '4242 4242 4242 4242';
		cart.value = JSON.stringify([{ productId: 'weekender', quantity: -2 }]);
		checkoutForm.requestSubmit();
	});
	await expect(page.getByRole('button', { name: 'Placing your order…' })).toBeVisible();
	await expect(page.getByText('Charged once.')).toBeVisible();
	await expect(
		page.getByText('3 matching submissions resolved to this single order.'),
	).toBeVisible();
	await expect(page.locator('[data-order-id]')).toHaveCount(1);
	await expect.poll(() => checkoutPosts).toBe(3);
	await expect(page.getByText('Paid once').locator('..')).toContainText('£148');
	const firstOrderId = await page.locator('[data-order-id]').getAttribute('data-order-id');
	await page.goBack();
	await expect(page).toHaveURL(/\/checkout$/);
	await expect(page.getByRole('heading', { name: 'Your basket is empty.' })).toBeVisible();

	// A completed key is rotated: a later genuine purchase in the same browser
	// session must not be mistaken for a duplicate of the first order.
	await openCheckout(page, 'drift-mug');
	await fillValidCheckout(page);
	await page.getByRole('button', { name: 'Place order securely' }).click();
	await expect(
		page.getByRole('heading', { name: 'Thank you. It is in good hands.' }),
	).toBeVisible();
	const secondOrderId = await page.locator('[data-order-id]').getAttribute('data-order-id');
	expect(secondOrderId).not.toBe(firstOrderId);
	await expect(page.getByText('Paid once').locator('..')).toContainText('£34');
});

test('preserves checkout details through a decline and offline retry before completing once', async ({
	page,
	context,
}) => {
	await openCheckout(page, 'field-notes');
	await fillValidCheckout(page, '4000 0000 0000 0000');
	await page.getByRole('button', { name: 'Place order securely' }).click();
	await expect(page.getByRole('alert')).toContainText('The fixture bank declined this card.');
	await expect(page.getByRole('textbox', { name: 'Full name' })).toHaveValue('Mara Finch');
	await expect(page.getByRole('textbox', { name: 'Street address' })).toHaveValue(
		'18 Bramble Lane',
	);

	await page.getByRole('textbox', { name: 'Card number' }).fill('4242 4242 4242 4242');
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Place order securely' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'You are offline. Your details are still here',
	);
	await expect(page.locator('.offline-banner')).toContainText('You are offline.');
	await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveValue(
		'mara@example.test',
	);

	await context.setOffline(false);
	await expect(page.locator('.offline-banner')).toBeHidden();
	await page.getByRole('button', { name: 'Place order securely' }).click();
	await expect(
		page.getByRole('heading', { name: 'Thank you. It is in good hands.' }),
	).toBeVisible();
	await expect(page.getByText('Paid once').locator('..')).toContainText('£42');
});
