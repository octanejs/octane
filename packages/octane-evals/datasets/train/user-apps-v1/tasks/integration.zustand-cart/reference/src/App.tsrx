import { create } from '@octanejs/zustand';

const products = [
	{ id: 'coffee', name: 'Coffee', priceCents: 1250 },
	{ id: 'tea', name: 'Tea', priceCents: 500 },
] as const;

type ProductId = (typeof products)[number]['id'];

interface CartState {
	quantities: Partial<Record<ProductId, number>>;
	add: (id: ProductId) => void;
	decrease: (id: ProductId) => void;
	clear: () => void;
}

const useCartStore = create<CartState>(
	(set) => ({
		quantities: {},
		add: (id) => set(
			(state) => ({
				quantities: {
					...state.quantities,
					[id]: (state.quantities[id] ?? 0) + 1,
				},
			}),
		),
		decrease: (id) => set((state) => {
			const quantities = { ...state.quantities };
			const next = (quantities[id] ?? 0) - 1;
			if (next > 0) quantities[id] = next;
			else delete quantities[id];
			return { quantities };
		}),
		clear: () => set({ quantities: {} }),
	}),
);

function formatPrice(cents: number): string {
	return '£' + (cents / 100).toFixed(2);
}

export function App() @{
	const quantities = useCartStore((state) => state.quantities);
	const add = useCartStore((state) => state.add);
	const decrease = useCartStore((state) => state.decrease);
	const clear = useCartStore((state) => state.clear);
	const lines = products.filter((product) => (quantities[product.id] ?? 0) > 0);
	const total = products.reduce(
		(sum, product) => sum + product.priceCents * (quantities[product.id] ?? 0),
		0,
	);

	<main>
		<h1>Shopping cart</h1>
		<div>
			@for (const product of products; key product.id) {
				<button aria-label={'Add ' + product.name} onClick={() => add(product.id)}>
					{'Add ' + product.name}
				</button>
			}
		</div>
		@if (lines.length === 0) {
			<p>Cart empty</p>
		} @else {
			<ul>
				@for (const product of lines; key product.id) {
					<li>
						<span>
							{product.name + ' × ' + (quantities[product.id] ?? 0)}
						</span>
						<button aria-label={'Decrease ' + product.name} onClick={() => decrease(product.id)}>
							{'Decrease ' + product.name}
						</button>
					</li>
				}
			</ul>
		}
		<p>
			{'Total: ' + formatPrice(total)}
		</p>
		<button disabled={lines.length === 0} onClick={clear}>Clear cart</button>
	</main>
}
