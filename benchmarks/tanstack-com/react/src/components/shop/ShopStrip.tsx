import { ShopPanel } from './ui';

/** Bottom-of-page info strip (shipping, returns, etc.). */
export function ShopStrip({ items }: { items: Array<string> }) {
	return (
		<ShopPanel className="mt-12 px-4.5 py-4 flex flex-wrap gap-4 justify-between font-shop-mono text-[11px] tracking-[0.1em] uppercase text-shop-text-2">
			{items.map((item) => (
				<span key={item} className="inline-flex items-center gap-2">
					<span
						aria-hidden="true"
						className="inline-block w-1.5 h-1.5 rounded-full bg-shop-accent"
					/>
					{item}
				</span>
			))}
		</ShopPanel>
	);
}
