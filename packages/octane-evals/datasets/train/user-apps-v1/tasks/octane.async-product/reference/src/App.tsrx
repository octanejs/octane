import { use } from 'octane';

export interface Product {
	id: string;
	name: string;
	priceCents: number;
}

export function App(props: {
	productId: string;
	loadProduct: (id: string) => Promise<Product>;
}) @{
	<section aria-label="Product details">
		@try {
			const product = use(props.loadProduct(props.productId));
			<article class="product" data-product-id={product.id}>
				<h2>
					{product.name as string}
				</h2>
				<p class="price">
					{'$' + (product.priceCents / 100).toFixed(2)}
				</p>
			</article>
		} @pending {
			<p class="loading">Loading product…</p>
		} @catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			<p class="error" role="alert">
				{message as string}
			</p>
		}
	</section>
}
