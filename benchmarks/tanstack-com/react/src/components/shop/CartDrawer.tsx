import * as Dialog from '@radix-ui/react-dialog';
import { Link } from '@tanstack/react-router';
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useCart, useRemoveCartLine, useUpdateCartLine } from '~/hooks/useCart';
import { formatMoney, shopifyImageUrl } from '~/utils/shopify-format';
import type { CartLineDetail } from '~/utils/shopify-queries';
import { ShopLabel, ShopMono } from './ui';

type CartDrawerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/**
 * Slide-in cart drawer. Shares state with /shop/cart through the same
 * useCart React Query key. The root element wears `shop-scope` because the
 * drawer is portaled outside the ShopLayout tree.
 */
export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
	const { cart, totalQuantity } = useCart();
	const hasLines = !!cart && cart.lines.nodes.length > 0;

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="cart-overlay fixed inset-0 z-[100] bg-black/40" />
				<Dialog.Content
					className={twMerge(
						'shop-scope cart-panel',
						'fixed right-4 top-[calc(var(--navbar-height,56px)+0.5rem)] z-[100]',
						'w-[calc(100vw-2rem)] sm:w-[24rem]',
						'max-h-[calc(100dvh-var(--navbar-height,56px)-1rem)]',
						'flex flex-col rounded-xl',
						'bg-shop-bg-2 border border-shop-line text-shop-text',
						'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]',
					)}
					aria-describedby={undefined}
				>
					<header className="flex items-center justify-between px-5 py-3 border-b border-shop-line">
						<Dialog.Title asChild>
							<ShopLabel as="h2">Cart{totalQuantity > 0 ? ` (${totalQuantity})` : ''}</ShopLabel>
						</Dialog.Title>
						<Dialog.Close
							aria-label="Close cart"
							className="p-1 rounded-md text-shop-text-2 hover:text-shop-text"
						>
							<X className="w-3.5 h-3.5" />
						</Dialog.Close>
					</header>

					{hasLines ? (
						<>
							<ul className="overflow-y-auto px-5 flex-1 min-h-0">
								{cart.lines.nodes.map((line) => (
									<DrawerCartLine key={line.id} line={line} onClose={() => onOpenChange(false)} />
								))}
							</ul>
							<DrawerFooter cart={cart} onClose={() => onOpenChange(false)} />
						</>
					) : (
						<DrawerEmpty onClose={() => onOpenChange(false)} />
					)}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function DrawerEmpty({ onClose }: { onClose: () => void }) {
	return (
		<div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center text-shop-text-2">
			<ShoppingCart className="w-10 h-10 text-shop-muted" />
			<p>Your cart is empty.</p>
			<Link
				to="/shop"
				onClick={onClose}
				className="
          inline-flex items-center gap-2 px-4 py-2.5 rounded-md
          bg-shop-accent text-shop-accent-ink font-semibold text-[13px]
          transition-[filter] hover:brightness-110 group
        "
			>
				Shop all products
				<span className="transition-transform group-hover:translate-x-[3px]">→</span>
			</Link>
		</div>
	);
}

function DrawerFooter({
	cart,
	onClose,
}: {
	cart: NonNullable<ReturnType<typeof useCart>['cart']>;
	onClose: () => void;
}) {
	const subtotal = cart.cost.subtotalAmount;
	return (
		<footer className="px-5 py-4 flex flex-col gap-3 border-t border-shop-line">
			<div className="flex justify-between text-sm">
				<span className="text-shop-text-2">Subtotal</span>
				<ShopMono className="font-medium text-shop-text">
					{formatMoney(subtotal.amount, subtotal.currencyCode)}
				</ShopMono>
			</div>
			<p className="font-shop-mono text-xs text-shop-muted tracking-[0.06em]">
				Shipping and taxes calculated at checkout.
			</p>
			<a
				href={cart.checkoutUrl}
				className="
          w-full h-10 rounded-md bg-shop-accent text-shop-accent-ink
          font-semibold text-[13px] flex items-center justify-center gap-2
          transition-[filter] hover:brightness-110 group
        "
			>
				Checkout
				<span className="transition-transform group-hover:translate-x-[3px]">→</span>
			</a>
			<Link
				to="/shop/cart"
				onClick={onClose}
				className="text-center text-sm text-shop-text-2 hover:underline"
			>
				View cart
			</Link>
		</footer>
	);
}

function DrawerCartLine({ line, onClose }: { line: CartLineDetail; onClose: () => void }) {
	const update = useUpdateCartLine();
	const remove = useRemoveCartLine();
	const { merchandise } = line;
	const options = merchandise.selectedOptions
		.filter((o) => o.name.toLowerCase() !== 'title')
		.map((o) => `${o.name}: ${o.value}`)
		.join(' · ');

	const isBusy = update.isPending || remove.isPending;

	return (
		<li className="flex gap-3 py-4 border-b border-shop-line">
			<Link
				to="/shop/$handle"
				params={{ handle: merchandise.product.handle }}
				onClick={onClose}
				className="shrink-0 w-16 h-16 rounded-md border border-shop-line bg-shop-panel overflow-hidden"
			>
				{merchandise.image ? (
					<img
						src={shopifyImageUrl(merchandise.image.url, {
							width: 160,
							format: 'webp',
						})}
						alt={merchandise.image.altText ?? merchandise.product.title}
						className="w-full h-full object-cover"
					/>
				) : null}
			</Link>
			<div className="flex-1 min-w-0 flex flex-col gap-1">
				<Link
					to="/shop/$handle"
					params={{ handle: merchandise.product.handle }}
					onClick={onClose}
					className="text-sm font-semibold text-shop-text hover:underline truncate"
				>
					{merchandise.product.title}
				</Link>
				{options ? (
					<ShopMono className="block text-xs text-shop-muted truncate">{options}</ShopMono>
				) : null}
				<div className="flex items-center justify-between mt-1">
					<div className="inline-flex items-center border border-shop-line rounded-md text-xs">
						<button
							type="button"
							onClick={() => {
								if (line.quantity <= 1) {
									remove.mutate({ lineId: line.id });
								} else {
									update.mutate({
										lineId: line.id,
										quantity: line.quantity - 1,
									});
								}
							}}
							disabled={isBusy}
							aria-label="Decrease quantity"
							className="p-1.5 text-shop-text-2 hover:text-shop-text disabled:opacity-50"
						>
							<Minus className="w-3 h-3" />
						</button>
						<span className="font-shop-mono text-shop-text min-w-[1.5rem] text-center">
							{line.quantity}
						</span>
						<button
							type="button"
							onClick={() =>
								update.mutate({
									lineId: line.id,
									quantity: line.quantity + 1,
								})
							}
							disabled={isBusy}
							aria-label="Increase quantity"
							className="p-1.5 text-shop-text-2 hover:text-shop-text disabled:opacity-50"
						>
							<Plus className="w-3 h-3" />
						</button>
					</div>
					<div className="flex items-center gap-2">
						<ShopMono className="text-sm font-medium text-shop-text">
							{formatMoney(line.cost.totalAmount.amount, line.cost.totalAmount.currencyCode)}
						</ShopMono>
						<button
							type="button"
							onClick={() => remove.mutate({ lineId: line.id })}
							disabled={isBusy}
							aria-label="Remove from cart"
							className="p-1 rounded-md text-shop-muted hover:text-shop-text disabled:opacity-50"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
			</div>
		</li>
	);
}
