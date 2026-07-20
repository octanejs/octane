import { Link } from '@tanstack/react-router';
import { ShopLabel, ShopMono, ShopPanel, ShopPulse } from './ui';

export type DropCardRow = { label: string; value: string };

type Props = {
	/** Top-row label, e.g. "Shop now — free US shipping over $75". */
	status: string;
	/** Display headline inside the card. */
	headline: string;
	/** Rows of key/value copy (dashed dividers between). */
	rows?: Array<DropCardRow>;
	/** Primary CTA. */
	cta: { label: string; href: string };
	/** Optional sub-line below the CTA (e.g. countdown or fine print). */
	ctaSub?: React.ReactNode;
};

/**
 * Live-drop / promo card in the shop hero. Pulses green, leads with a
 * display-type headline, prices out a few stats, and drops a CTA at the foot.
 */
export function ShopDropCard({ status, headline, rows, cta, ctaSub }: Props) {
	return (
		<ShopPanel className="w-full md:min-w-[280px] md:max-w-[320px] p-4 pb-3.5 flex flex-col self-start">
			<ShopLabel className="mb-2.5 flex items-center gap-2 text-shop-muted">
				<ShopPulse />
				{status}
			</ShopLabel>
			<div className="font-shop-display font-bold text-[19px] tracking-[-0.015em] text-shop-text">
				{headline}
			</div>
			{rows?.map((row) => (
				<div
					key={row.label}
					className="flex justify-between text-[12px] text-shop-text-2 border-t border-dashed border-shop-line-2 pt-1.5 mt-2"
				>
					<span>{row.label}</span>
					<ShopMono className="text-shop-text text-[11px] font-medium">{row.value}</ShopMono>
				</div>
			))}
			<Link
				to={cta.href}
				className="
          mt-3 flex items-center justify-center gap-2
          px-3 py-2.5 rounded-md bg-shop-accent text-shop-accent-ink
          text-[12.5px] font-semibold tracking-[0.01em]
          transition-[filter] hover:brightness-110 group
        "
			>
				{cta.label}
				<span className="transition-transform group-hover:translate-x-[3px]">→</span>
			</Link>
			{ctaSub ? (
				<ShopMono className="mt-2 text-center text-[11px] text-shop-muted tracking-[0.04em]">
					{ctaSub}
				</ShopMono>
			) : null}
		</ShopPanel>
	);
}
