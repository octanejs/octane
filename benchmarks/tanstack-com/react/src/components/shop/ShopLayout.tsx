import * as React from 'react';
import { CartDrawer } from './CartDrawer';
import { useCartDrawerStore } from './cartDrawerStore';

type ShopLayoutProps = {
	children: React.ReactNode;
};

export function ShopLayout({ children }: ShopLayoutProps) {
	return (
		<div className="shop-scope relative min-h-[calc(100vh-var(--navbar-height,0px))]">
			<main className="min-w-0">{children}</main>
			<ShopCartDrawer />
		</div>
	);
}

function ShopCartDrawer() {
	const open = useCartDrawerStore((s) => s.open);
	const setOpen = useCartDrawerStore((s) => s.setOpen);
	return <CartDrawer open={open} onOpenChange={setOpen} />;
}
