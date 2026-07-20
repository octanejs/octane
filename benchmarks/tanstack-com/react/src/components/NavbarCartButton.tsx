import { Link, useLocation } from '@tanstack/react-router';
import { ShoppingCart } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useCart } from '~/hooks/useCart';
import { useCartDrawerStore } from '~/components/shop/cartDrawerStore';

const badgeClasses = twMerge(
	'absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1',
	'flex items-center justify-center rounded-full',
	'text-[0.65rem] font-bold leading-none',
	'bg-black text-white dark:bg-white dark:text-black',
);

const buttonClasses = twMerge(
	'relative flex items-center justify-center',
	'h-9 w-9 rounded-lg transition-colors',
	'hover:bg-gray-500/10 text-gray-700 dark:text-gray-300',
);

/**
 * Cart button in the main Navbar.
 *
 * Behaviour:
 *   • On /shop/* routes → opens the cart drawer (drawer is mounted in
 *     ShopLayout, so it exists on these routes)
 *   • Everywhere else → navigates to /shop/cart (no drawer mounted
 *     outside the shop, and full navigation is the right UX anyway)
 *
 * Visibility:
 *   • Always visible on /shop/* routes (even at zero items)
 *   • Site-wide when the cart has at least one item
 *   • Hidden elsewhere when the cart is empty
 */
export function NavbarCartButton() {
	const { pathname } = useLocation();
	const { totalQuantity } = useCart();
	const openDrawer = useCartDrawerStore((s) => s.openDrawer);
	const onShopRoute = pathname === '/shop' || pathname.startsWith('/shop/');

	if (!onShopRoute && totalQuantity === 0) return null;

	const badge =
		totalQuantity > 0 ? (
			<span className={badgeClasses}>{totalQuantity > 99 ? '99+' : totalQuantity}</span>
		) : null;

	const label = totalQuantity > 0 ? `Cart (${totalQuantity} items)` : 'Cart';

	// On shop routes: open the drawer (it's mounted in ShopLayout)
	if (onShopRoute) {
		return (
			<button type="button" onClick={openDrawer} aria-label={label} className={buttonClasses}>
				<ShoppingCart className="w-4 h-4" />
				{badge}
			</button>
		);
	}

	// Everywhere else: navigate to the cart page
	return (
		<Link to="/shop/cart" aria-label={label} className={buttonClasses}>
			<ShoppingCart className="w-4 h-4" />
			{badge}
		</Link>
	);
}
