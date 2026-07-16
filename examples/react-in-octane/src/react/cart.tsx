// Plain React code: React hooks, React JSX, an unmodified npm package (jotai).
// The automatic JSX runtime and the `react` import resolve to the Octane
// facades, so this renders on Octane — no React installed.
import { atom, useAtom } from 'jotai';

const cartAtom = atom<string[]>([]);

const PRODUCTS = ['Keyboard', 'Mouse', 'Monitor'];

export function CartControls() {
	const [cart, setCart] = useAtom(cartAtom);
	return (
		<ul className="products">
			{PRODUCTS.map((product) => (
				<li key={product}>
					{product}
					<button onClick={() => setCart([...cart, product])}>Add</button>
				</li>
			))}
		</ul>
	);
}

// A separate island sharing the same atom: jotai's store wiring — the real
// package, not a port — keeps the two islands in sync.
export function CartSummary() {
	const [cart, setCart] = useAtom(cartAtom);
	return (
		<p className="cart-summary">
			{cart.length === 0 ? 'Cart is empty' : `${cart.length} item(s): ${cart.join(', ')}`}
			{cart.length > 0 && <button onClick={() => setCart([])}>Clear</button>}
		</p>
	);
}
