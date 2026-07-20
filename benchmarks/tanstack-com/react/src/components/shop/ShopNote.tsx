/**
 * Accent-tinted callout used for drop notes / disclaimers.
 * Pass a short `pill` label to highlight (mono, uppercase) and children for
 * the body copy.
 */
export function ShopNote({ pill, children }: { pill?: string; children: React.ReactNode }) {
	return (
		<div className="mt-4 p-3 rounded-lg flex gap-2.5 items-start text-[12px] text-shop-text-2 leading-[1.55] bg-shop-accent/10 border border-shop-accent/20">
			{pill ? (
				<span className="font-shop-mono text-[9.5px] tracking-[0.1em] uppercase bg-shop-accent text-shop-accent-ink px-1.5 py-0.5 rounded font-semibold shrink-0 mt-0.5">
					{pill}
				</span>
			) : null}
			<span>{children}</span>
		</div>
	);
}
