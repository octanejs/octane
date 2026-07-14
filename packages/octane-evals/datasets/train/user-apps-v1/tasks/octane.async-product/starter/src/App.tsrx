export interface Product {
	id: string;
	name: string;
	priceCents: number;
}

export function App(_props: {
	productId: string;
	loadProduct: (id: string) => Promise<Product>;
}) @{
	<section aria-label="Product details">
		<p>Not implemented</p>
	</section>
}
