import {
	useActionState,
	useCallback,
	useEffect,
	useFormStatus,
	useMemo,
	useRef,
	useState,
} from 'octane';
import {
	INITIAL_CHECKOUT_STATE,
	PRODUCTS,
	addCartLine,
	cartCount,
	cartSubtotal,
	deliveryCost,
	formatMoney,
	getProduct,
	orderTotal,
	readStoredCart,
	readStoredOrder,
	routeFromUrl,
	updateCartLine,
} from './domain.ts';
import './styles.css';

module server {
	import { commitOrder } from './server-domain.ts';

	export async function placeOrder(request) {
		return commitOrder(request);
	}
}

import { placeOrder } from 'server';

const CART_STORAGE_KEY = 'cartlane:cart:v1';
const ORDER_STORAGE_KEY = 'cartlane:last-order:v1';
const SESSION_STORAGE_KEY = 'cartlane:checkout-key:v1';

function pause(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function AddToCartButton(props) @{
	const status = useFormStatus();
	<button
		class={['button', props.compact && 'button--compact']}
		type="submit"
		disabled={status.pending}
	>
		<span aria-hidden="true">
			{status.pending ? '···' : '+'}
		</span>
		<span>
			{status.pending ? 'Adding…' : props.label}
		</span>
	</button>
}

function CheckoutSubmit() @{
	const status = useFormStatus();
	<div class="checkout-submit">
		<button class="button button--checkout" type="submit" disabled={status.pending}>
			<span>
				{status.pending ? 'Placing your order…' : 'Place order securely'}
			</span>
			<span aria-hidden="true">→</span>
		</button>
		<p class="pending-copy" role="status" aria-live="polite">
			{status.pending
				? 'Your native form action is crossing the Cartlane server boundary.'
				: 'One secure request. Duplicate submits are safe.'}
		</p>
	</div>
}

function ProductArtwork(props) @{
	<div class="product-art" style={'--product-accent:' + props.product.accent} aria-hidden="true">
		<span class="product-art__halo"></span>
		<span class="product-art__glyph">{props.product.glyph}</span>
		<span class="product-art__label">
			{'Cartlane / ' + String(props.index + 1).padStart(2, '0')}
		</span>
	</div>
}

function ProductCard(props) @{
	<article class="product-card" data-product-id={props.product.id}>
		<a
			class="product-card__visual"
			href={'/products/' + props.product.id}
			onClick={(event) => {
				event.preventDefault();
				props.navigate('/products/' + props.product.id);
			}}
			aria-label={'View ' + props.product.name}
		>
			<ProductArtwork product={props.product} index={props.index} />
		</a>
		<div class="product-card__body">
			<div class="eyebrow-row">
				<span class="eyebrow">{props.product.category}</span>
				@if (props.product.badge) {
					<span class="product-badge">{props.product.badge}</span>
				}
			</div>
			<h2>
				<a
					href={'/products/' + props.product.id}
					onClick={(event) => {
						event.preventDefault();
						props.navigate('/products/' + props.product.id);
					}}
				>{props.product.name}</a>
			</h2>
			<p>{props.product.tagline}</p>
			<div class="product-card__footer">
				<strong>{formatMoney(props.product.priceCents)}</strong>
				<form action={props.addToCart}>
					<input type="hidden" name="productId" value={props.product.id} />
					<input type="hidden" name="quantity" value="1" />
					<AddToCartButton compact={true} label="Add" />
				</form>
			</div>
		</div>
	</article>
}

function Header(props) @{
	<header class="site-header">
		<a
			class="wordmark"
			href="/"
			onClick={(event) => {
				event.preventDefault();
				props.navigate('/');
			}}
			aria-label="Cartlane home"
		>
			<span class="wordmark__mark" aria-hidden="true">C</span>
			<span>Cartlane</span>
		</a>
		<nav class="site-nav" aria-label="Primary navigation">
			<a
				href="/"
				onClick={(event) => {
					event.preventDefault();
					props.navigate('/');
				}}
			>
				Shop
			</a>
			<a
				class="cart-link"
				href="/cart"
				onClick={(event) => {
					event.preventDefault();
					props.navigate('/cart');
				}}
				aria-label={'Basket, ' + props.count + (props.count === 1 ? ' item' : ' items')}
			>
				<span>Basket</span>
				<span class="cart-count" aria-hidden="true">
					{props.count as string}
				</span>
			</a>
		</nav>
	</header>
}

function Catalog(props) @{
	<main id="main-content" class="catalog" tabindex="-1">
		<section class="hero">
			<div class="hero__copy">
				<p class="kicker">Edition 07 · useful things, considered</p>
				<h1>Objects for a more intentional everyday.</h1>
				<p class="hero__lede">
					Small-batch goods chosen for how they work, wear, and quietly earn their place.
				</p>
			</div>
			<div class="hero__note" aria-label="Cartlane principles">
				<span>Made to last</span>
				<span>Repair over replace</span>
				<span>Free delivery over £120</span>
			</div>
		</section>

		<section class="catalog-section" aria-labelledby="catalog-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">The collection</p>
					<h2 id="catalog-heading">Considered essentials</h2>
				</div>
				<div class="catalog-controls">
					<label>
						<span class="sr-only">Search products</span>
						<input
							type="search"
							placeholder="Search the collection"
							value={props.query}
							onInput={(event) => props.setQuery(event.currentTarget.value)}
						/>
					</label>
					<label>
						<span class="sr-only">Filter by category</span>
						<select
							value={props.category}
							onChange={(event) => props.setCategory(event.currentTarget.value)}
						>
							<option value="All">All categories</option>
							<option value="Desk">Desk</option>
							<option value="Travel">Travel</option>
							<option value="Home">Home</option>
						</select>
					</label>
				</div>
			</div>

			@if (props.status === 'loading') {
				<div class="catalog-message" role="status">
					<span class="loader" aria-hidden="true"></span>
					<h3>Opening the collection…</h3>
					<p>Checking the local edition and availability.</p>
				</div>
			} @else if (props.status === 'error') {
				<div class="catalog-message catalog-message--error" role="alert">
					<p class="eyebrow">Collection unavailable</p>
					<h3>The stockroom did not answer.</h3>
					<p>This deterministic failure is safe to retry; your basket has not changed.</p>
					<button class="button" type="button" onClick={props.retryCatalog}>
						Retry collection
					</button>
				</div>
			} @else if (props.products.length === 0) {
				<div class="catalog-message">
					<p class="eyebrow">No matches</p>
					<h3>Nothing in this edition matches that search.</h3>
					<p>Try a broader phrase or return to the full collection.</p>
					<button class="text-button" type="button" onClick={props.clearFilters}>
						Clear filters
					</button>
				</div>
			} @else {
				<div class="product-grid">
					@for (const product of props.products; key product.id) {
						<ProductCard
							product={product}
							index={PRODUCTS.indexOf(product)}
							navigate={props.navigate}
							addToCart={props.addToCart}
						/>
					}
				</div>
			}
		</section>
	</main>
}

function ProductDetail(props) @{
	@if (!props.product) {
		<main id="main-content" class="empty-page" tabindex="-1">
			<p class="eyebrow">Not found</p>
			<h1>That object is not in this edition.</h1>
			<a
				href="/"
				onClick={(event) => {
					event.preventDefault();
					props.navigate('/');
				}}
			>Return to the collection</a>
		</main>
	} @else {
		<main id="main-content" class="product-detail" tabindex="-1">
			<nav class="breadcrumbs" aria-label="Breadcrumb">
				<a
					href="/"
					onClick={(event) => {
						event.preventDefault();
						props.navigate('/');
					}}
				>Collection</a>
				<span aria-hidden="true">/</span>
				<span aria-current="page">{props.product.name}</span>
			</nav>
			<div class="product-detail__layout">
				<ProductArtwork product={props.product} index={PRODUCTS.indexOf(props.product)} />
				<section class="product-detail__copy">
					<p class="eyebrow">{props.product.category} · Cartlane edition</p>
					<h1>{props.product.name}</h1>
					<p class="product-detail__tagline">{props.product.tagline}</p>
					<p>{props.product.description}</p>
					<strong class="product-detail__price">{formatMoney(props.product.priceCents)}</strong>
					<form class="detail-form" action={props.addToCart}>
						<input type="hidden" name="productId" value={props.product.id} />
						<label>
							<span>Quantity</span>
							<input name="quantity" type="number" min="1" max="8" defaultValue="1" />
						</label>
						<AddToCartButton label="Add to basket" />
					</form>
					<ul class="product-facts">
						<li>
							<span aria-hidden="true">✓</span>
							Dispatched in one working day
						</li>
						<li>
							<span aria-hidden="true">✓</span>
							30-day considered returns
						</li>
						<li>
							<span aria-hidden="true">✓</span>
							Plastic-free packaging
						</li>
					</ul>
				</section>
			</div>
		</main>
	}
}

function CartPage(props) @{
	<main id="main-content" class="cart-page" tabindex="-1">
		<div class="page-heading">
			<p class="eyebrow">Your selection</p>
			<h1>Basket</h1>
			<p>
				{props.count === 0
					? 'Nothing chosen yet.'
					: props.count + (props.count === 1 ? ' considered item' : ' considered items')}
			</p>
		</div>
		@if (!props.storageReady) {
			<div class="catalog-message" role="status">
				<span class="loader" aria-hidden="true"></span>
				<h2>Opening your basket…</h2>
			</div>
		} @else if (props.lines.length === 0) {
			<section class="empty-basket">
				<span class="empty-basket__mark" aria-hidden="true">○</span>
				<h2>Your basket has room for something useful.</h2>
				<p>The collection is small on purpose. Start with an object you will reach for often.</p>
				<a
					class="button"
					href="/"
					onClick={(event) => {
						event.preventDefault();
						props.navigate('/');
					}}
				>Browse the collection</a>
			</section>
		} @else {
			<div class="cart-layout">
				<section class="cart-lines" aria-label="Basket items">
					@for (const line of props.lines; key line.productId) {
						<article class="cart-line" data-cart-product={line.productId}>
							<ProductArtwork
								product={getProduct(line.productId)}
								index={PRODUCTS.findIndex((product) => product.id === line.productId)}
							/>
							<div class="cart-line__copy">
								<p class="eyebrow">{getProduct(line.productId).category}</p>
								<h2>{getProduct(line.productId).name}</h2>
								<p>{formatMoney(getProduct(line.productId).priceCents)} each</p>
								<form class="quantity-form" action={props.adjustCart}>
									<input type="hidden" name="productId" value={line.productId} />
									<button
										type="submit"
										name="intent"
										value="decrease"
										aria-label={'Decrease ' + getProduct(line.productId).name + ' quantity'}
									>−</button>
									<output aria-label={'Quantity for ' + getProduct(line.productId).name}>
										{line.quantity as string}
									</output>
									<button
										type="submit"
										name="intent"
										value="increase"
										aria-label={'Increase ' + getProduct(line.productId).name + ' quantity'}
									>+</button>
									<button class="remove-line" type="submit" name="intent" value="remove">
										Remove
									</button>
								</form>
							</div>
							<strong>{formatMoney(getProduct(line.productId).priceCents * line.quantity)}</strong>
						</article>
					}
				</section>
				<aside class="order-summary" aria-labelledby="summary-heading">
					<p class="eyebrow">Ready when you are</p>
					<h2 id="summary-heading">Order summary</h2>
					<dl>
						<div>
							<dt>Subtotal</dt>
							<dd>{formatMoney(props.subtotal)}</dd>
						</div>
						<div>
							<dt>Delivery</dt>
							<dd>
								{props.delivery === 0 ? 'Complimentary' : formatMoney(props.delivery)}
							</dd>
						</div>
						<div class="summary-total">
							<dt>Total</dt>
							<dd>{formatMoney(props.total)}</dd>
						</div>
					</dl>
					<a
						class="button button--checkout"
						href="/checkout"
						onClick={(event) => {
							event.preventDefault();
							props.navigate('/checkout');
						}}
					>
						<span>Continue to checkout</span>
						<span aria-hidden="true">→</span>
					</a>
					<p class="summary-note">Taxes included. No account required.</p>
				</aside>
			</div>
		}
	</main>
}

function FieldError(props) @{
	@if (props.message) {
		<p class="field-error" id={props.id}>{props.message}</p>
	} @else {
		<span></span>
	}
}

function CheckoutPage(props) @{
	const errors =
		props.state.status === 'invalid' ? props.state.errors : {};
	<main id="main-content" class="checkout-page" tabindex="-1">
		<nav class="checkout-steps" aria-label="Checkout progress">
			<span class="checkout-step checkout-step--done">Basket</span>
			<span aria-hidden="true">—</span>
			<span class="checkout-step checkout-step--active" aria-current="step">Details</span>
			<span aria-hidden="true">—</span>
			<span class="checkout-step">Confirmed</span>
		</nav>
		@if (!props.storageReady || !props.checkoutKey) {
			<div class="catalog-message" role="status">
				<span class="loader" aria-hidden="true"></span>
				<h1>Preparing secure checkout…</h1>
			</div>
		} @else if (props.lines.length === 0) {
			<section class="empty-basket">
				<h1>Your basket is empty.</h1>
				<p>Add something from the collection before opening checkout.</p>
				<a
					class="button"
					href="/"
					onClick={(event) => {
						event.preventDefault();
						props.navigate('/');
					}}
				>Return to the collection</a>
			</section>
		} @else {
			<div class="checkout-layout">
				<section class="checkout-form-wrap" aria-busy={props.pending}>
					<p class="eyebrow">Secure checkout</p>
					<h1>Where should we send it?</h1>
					<p class="checkout-intro">No account, no distractions. Complete the native form below.</p>
					@if (props.state.status === 'failure' || props.state.status === 'invalid') {
						<div class="form-alert" role="alert">
							<strong>
								{props.state.status === 'failure'
									? 'Order not placed'
									: 'A few details need attention'}
							</strong>
							<p>{props.state.message}</p>
						</div>
					}
					<form class="checkout-form" action={props.action} noValidate data-checkout-form="true">
						<input type="hidden" name="idempotencyKey" value={props.checkoutKey} />
						<input type="hidden" name="cart" value={JSON.stringify(props.lines)} />
						<fieldset>
							<legend>Contact</legend>
							<label class={errors.name && 'field--invalid'}>
								<span>Full name</span>
								<input
									name="name"
									autocomplete="name"
									aria-invalid={errors.name ? 'true' : undefined}
									aria-describedby={errors.name ? 'name-error' : undefined}
								/>
								<FieldError id="name-error" message={errors.name} />
							</label>
							<label class={errors.email && 'field--invalid'}>
								<span>Email address</span>
								<input
									name="email"
									type="email"
									autocomplete="email"
									aria-invalid={errors.email ? 'true' : undefined}
									aria-describedby={errors.email ? 'email-error' : undefined}
								/>
								<FieldError id="email-error" message={errors.email} />
							</label>
						</fieldset>
						<fieldset>
							<legend>Delivery</legend>
							<label class={errors.address && 'field--invalid'}>
								<span>Street address</span>
								<input
									name="address"
									autocomplete="street-address"
									aria-invalid={errors.address ? 'true' : undefined}
									aria-describedby={errors.address ? 'address-error' : undefined}
								/>
								<FieldError id="address-error" message={errors.address} />
							</label>
							<div class="field-row">
								<label class={errors.city && 'field--invalid'}>
									<span>Town or city</span>
									<input
										name="city"
										autocomplete="address-level2"
										aria-invalid={errors.city ? 'true' : undefined}
										aria-describedby={errors.city ? 'city-error' : undefined}
									/>
									<FieldError id="city-error" message={errors.city} />
								</label>
								<label class={errors.postalCode && 'field--invalid'}>
									<span>Postal code</span>
									<input
										name="postalCode"
										autocomplete="postal-code"
										aria-invalid={errors.postalCode ? 'true' : undefined}
										aria-describedby={errors.postalCode ? 'postal-error' : undefined}
									/>
									<FieldError id="postal-error" message={errors.postalCode} />
								</label>
							</div>
						</fieldset>
						<fieldset>
							<legend>Fixture payment</legend>
							<label class={errors.cardNumber && 'field--invalid'}>
								<span>Card number</span>
								<input
									name="cardNumber"
									inputmode="numeric"
									autocomplete="cc-number"
									placeholder="4242 4242 4242 4242"
									aria-invalid={errors.cardNumber ? 'true' : undefined}
									aria-describedby={errors.cardNumber ? 'card-error card-hint' : 'card-hint'}
								/>
								<small id="card-hint">Use 4242 for success or 4000 to exercise a decline.</small>
								<FieldError id="card-error" message={errors.cardNumber} />
							</label>
							<label class={['terms-field', errors.agreeToTerms && 'field--invalid']}>
								<input
									name="agreeToTerms"
									type="checkbox"
									value="yes"
									aria-invalid={errors.agreeToTerms ? 'true' : undefined}
									aria-describedby={errors.agreeToTerms ? 'terms-error' : undefined}
								/>
								<span>I agree to the Cartlane fixture terms.</span>
							</label>
							<FieldError id="terms-error" message={errors.agreeToTerms} />
						</fieldset>
						<CheckoutSubmit />
					</form>
				</section>
				<aside class="checkout-summary" aria-label="Checkout summary">
					<p class="eyebrow">Your order</p>
					@for (const line of props.lines; key line.productId) {
						<div class="checkout-summary__line">
							<span>
								{line.quantity + ' × ' + getProduct(line.productId).name}
							</span>
							<strong>{formatMoney(line.quantity * getProduct(line.productId).priceCents)}</strong>
						</div>
					}
					<div class="checkout-summary__total">
						<span>Total</span>
						<strong>{formatMoney(props.total)}</strong>
					</div>
				</aside>
			</div>
		}
	</main>
}

function OrderPage(props) @{
	@if (!props.order || props.order.id !== props.orderId) {
		<main id="main-content" class="empty-page" tabindex="-1">
			<p class="eyebrow">Order lookup</p>
			<h1>We could not find that order on this device.</h1>
			<p>Cartlane stores this deterministic receipt locally after checkout.</p>
			<a
				href="/"
				onClick={(event) => {
					event.preventDefault();
					props.navigate('/');
				}}
			>Return to the collection</a>
		</main>
	} @else {
		<main id="main-content" class="confirmation" tabindex="-1" data-order-id={props.order.id}>
			<div class="confirmation__mark" aria-hidden="true">✓</div>
			<p class="eyebrow">Order confirmed</p>
			<h1>Thank you. It is in good hands.</h1>
			<p class="confirmation__lede">A receipt is ready for {props.order.email}.</p>
			@if (props.checkoutState.status === 'success' && props.checkoutState.duplicate) {
				<div class="idempotency-note" role="status">
					<strong>Charged once.</strong>
					<span>
						{' ' + props.checkoutState.submissionCount +
							' matching submissions resolved to this single order.'}
					</span>
				</div>
			}
			<section class="receipt" aria-labelledby="receipt-heading">
				<div class="receipt__heading">
					<div>
						<p class="eyebrow">Reference</p>
						<h2 id="receipt-heading">{props.order.id}</h2>
					</div>
					<span>{props.order.placedAt}</span>
				</div>
				<dl>
					<div>
						<dt>Items</dt>
						<dd>
							{props.order.lineCount as string}
						</dd>
					</div>
					<div>
						<dt>Delivering to</dt>
						<dd>{props.order.deliveryLabel}</dd>
					</div>
					<div>
						<dt>Paid once</dt>
						<dd>{formatMoney(props.order.totalCents)}</dd>
					</div>
				</dl>
			</section>
			<a
				class="button"
				href="/"
				onClick={(event) => {
					event.preventDefault();
					props.navigate('/');
				}}
			>Continue browsing</a>
		</main>
	}
}

export function App(props) @{
	const initialUrl = props.url ?? '/';
	const initialScenario = new URL(initialUrl, 'https://cartlane.local').searchParams.get(
		'scenario',
	);
	const [route, setRoute] = useState(() => routeFromUrl(initialUrl));
	const [lines, setLines] = useState([]);
	const [storageReady, setStorageReady] = useState(false);
	const [checkoutKey, setCheckoutKey] = useState('');
	const [lastOrder, setLastOrder] = useState(null);
	const [online, setOnline] = useState(true);
	const [hydrated, setHydrated] = useState(false);
	const [notice, setNotice] = useState('');
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState('All');
	const [catalogStatus, setCatalogStatus] = useState(
		initialScenario === 'catalog-failure' ? 'loading' : 'ready',
	);
	const failurePendingRef = useRef(initialScenario === 'catalog-failure');
	const catalogTimerRef = useRef(null);

	const navigate = useCallback((destination) => {
		history.pushState(null, '', destination);
		setRoute(routeFromUrl(destination));
		window.scrollTo({ top: 0, behavior: 'instant' });
	}, []);

	useEffect(() => {
		setLines(readStoredCart(localStorage.getItem(CART_STORAGE_KEY)));
		setLastOrder(readStoredOrder(localStorage.getItem(ORDER_STORAGE_KEY)));
		let key = sessionStorage.getItem(SESSION_STORAGE_KEY);
		if (!key) {
			key = crypto.randomUUID();
			sessionStorage.setItem(SESSION_STORAGE_KEY, key);
		}
		setCheckoutKey(key);
		setStorageReady(true);
		setOnline(navigator.onLine);
		setHydrated(true);

		const updateRoute = () => setRoute(routeFromUrl(window.location.href));
		const markOnline = () => setOnline(true);
		const markOffline = () => setOnline(false);
		window.addEventListener('popstate', updateRoute);
		window.addEventListener('online', markOnline);
		window.addEventListener('offline', markOffline);
		return () => {
			window.removeEventListener('popstate', updateRoute);
			window.removeEventListener('online', markOnline);
			window.removeEventListener('offline', markOffline);
		};
	}, []);

	useEffect(() => {
		if (!storageReady) return;
		localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
	}, [lines, storageReady]);

	useEffect(() => {
		if (!failurePendingRef.current) return;
		catalogTimerRef.current = window.setTimeout(() => setCatalogStatus('error'), 180);
		return () => {
			if (catalogTimerRef.current !== null) window.clearTimeout(catalogTimerRef.current);
		};
	}, []);

	const retryCatalog = useCallback(() => {
		setCatalogStatus('loading');
		if (catalogTimerRef.current !== null) window.clearTimeout(catalogTimerRef.current);
		catalogTimerRef.current = window.setTimeout(() => {
			failurePendingRef.current = false;
			setCatalogStatus('ready');
		}, 180);
	}, []);

	const addToCart = useCallback(async (formData) => {
		const productId = String(formData.get('productId') ?? '');
		const product = getProduct(productId);
		if (!product) return;
		const quantity = Number(formData.get('quantity') ?? 1);
		await pause(90);
		setLines((current) => addCartLine(current, productId, quantity));
		setNotice(product.name + ' added to your basket.');
	}, []);

	const adjustCart = useCallback(async (formData) => {
		const productId = String(formData.get('productId') ?? '');
		const intent = String(formData.get('intent') ?? '');
		await pause(45);
		setLines((current) => {
			const line = current.find((candidate) => candidate.productId === productId);
			if (!line) return current;
			if (intent === 'remove') return updateCartLine(current, productId, 0);
			return updateCartLine(current, productId, line.quantity + (intent === 'increase' ? 1 : -1));
		});
	}, []);

	const [checkoutState, checkoutAction, checkoutPending] = useActionState(async (
		previous,
		formData,
	) => {
		if (!navigator.onLine) {
			return {
				status: 'failure',
				message: 'You are offline. Your details are still here; reconnect and retry.',
				recoverable: true,
			};
		}
		let submittedLines = [];
		try {
			submittedLines = JSON.parse(String(formData.get('cart') ?? '[]'));
		} catch {
			submittedLines = [];
		}
		try {
			const result = await placeOrder({
				idempotencyKey: String(formData.get('idempotencyKey') ?? ''),
				lines: submittedLines,
				name: String(formData.get('name') ?? ''),
				email: String(formData.get('email') ?? ''),
				address: String(formData.get('address') ?? ''),
				city: String(formData.get('city') ?? ''),
				postalCode: String(formData.get('postalCode') ?? ''),
				cardNumber: String(formData.get('cardNumber') ?? ''),
				agreeToTerms: formData.get('agreeToTerms') === 'yes',
			});
			if (result.status === 'success') {
				setLastOrder(result.order);
				localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(result.order));
				setLines([]);
				const nextCheckoutKey = crypto.randomUUID();
				sessionStorage.setItem(SESSION_STORAGE_KEY, nextCheckoutKey);
				setCheckoutKey(nextCheckoutKey);
				const orderPath = '/orders/' + result.order.id;
				if (window.location.pathname !== orderPath) {
					history.pushState(null, '', orderPath);
				}
				setRoute({ name: 'order', orderId: result.order.id });
				window.scrollTo({ top: 0, behavior: 'instant' });
			}
			return result;
		} catch {
			return {
				status: 'failure',
				message: 'The secure checkout service did not answer. Your details are still here; retry safely.',
				recoverable: true,
			};
		}
	}, INITIAL_CHECKOUT_STATE);

	const visibleProducts = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return PRODUCTS.filter((product) => {
			const matchesCategory = category === 'All' || product.category === category;
			const haystack = (product.name + ' ' + product.tagline + ' ' +
				product.category).toLocaleLowerCase();
			return matchesCategory && (normalizedQuery === '' || haystack.includes(normalizedQuery));
		});
	}, [query, category]);

	const count = cartCount(lines);
	const subtotal = cartSubtotal(lines);
	const delivery = deliveryCost(subtotal);
	const total = orderTotal(lines);

	<div
		class="app"
		data-hydrated={hydrated ? 'true' : 'false'}
		data-app-ready={storageReady ? 'true' : 'false'}
	>
		<a class="skip-link" href="#main-content">Skip to main content</a>
		<div class="service-strip">
			<span>Complimentary UK delivery over £120</span>
			<span aria-hidden="true">·</span>
			<span>Objects chosen to stay</span>
		</div>
		<Header navigate={navigate} count={count} />
		@if (!online) {
			<div class="offline-banner" role="status">
				<span aria-hidden="true">◌</span>
				<strong>You are offline.</strong>
				Your basket is available; checkout will wait for a connection.
			</div>
		}
		<div class="toast-region" aria-live="polite" aria-atomic="true">
			@if (notice) {
				<div class="toast">
					<span aria-hidden="true">✓</span>
					{notice}
					<button type="button" onClick={() => setNotice('')} aria-label="Dismiss basket notice">
						×
					</button>
				</div>
			}
		</div>
		@if (route.name === 'catalog') {
			<Catalog
				status={catalogStatus}
				products={visibleProducts}
				query={query}
				setQuery={setQuery}
				category={category}
				setCategory={setCategory}
				retryCatalog={retryCatalog}
				clearFilters={() => {
					setQuery('');
					setCategory('All');
				}}
				navigate={navigate}
				addToCart={addToCart}
			/>
		} @else if (route.name === 'product') {
			<ProductDetail
				key={route.productId}
				product={getProduct(route.productId)}
				navigate={navigate}
				addToCart={addToCart}
			/>
		} @else if (route.name === 'cart') {
			<CartPage
				lines={lines}
				storageReady={storageReady}
				count={count}
				subtotal={subtotal}
				delivery={delivery}
				total={total}
				navigate={navigate}
				adjustCart={adjustCart}
			/>
		} @else if (route.name === 'checkout') {
			<CheckoutPage
				lines={lines}
				storageReady={storageReady}
				checkoutKey={checkoutKey}
				state={checkoutState}
				pending={checkoutPending}
				action={checkoutAction}
				total={total}
				navigate={navigate}
			/>
		} @else {
			<OrderPage
				orderId={route.orderId}
				order={lastOrder}
				checkoutState={checkoutState}
				navigate={navigate}
			/>
		}
		<footer class="site-footer">
			<div>
				<strong>Cartlane</strong>
				<span>Useful things, considered.</span>
			</div>
			<p>Deterministic products. Native forms. No live commerce dependency.</p>
		</footer>
	</div>
}
