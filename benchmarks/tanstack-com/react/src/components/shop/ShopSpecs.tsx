export type Spec = { label: string; value: React.ReactNode };

/** Two-column specs grid — mono label, plain value. */
export function ShopSpecs({ specs }: { specs: Array<Spec> }) {
	return (
		<div className="grid grid-cols-2 border-t border-shop-line mt-5.5">
			{specs.map((spec, i) => (
				<div
					key={spec.label}
					className={
						'flex justify-between gap-2.5 py-2.5 border-b border-shop-line text-[12.5px] ' +
						(i % 2 === 0 ? 'pr-3 border-r border-shop-line' : 'pl-3')
					}
				>
					<b className="font-shop-mono font-normal text-shop-muted text-[10.5px] tracking-[0.08em] uppercase">
						{spec.label}
					</b>
					<span className="text-shop-text text-right">{spec.value}</span>
				</div>
			))}
		</div>
	);
}
