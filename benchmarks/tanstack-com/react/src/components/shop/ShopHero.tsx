/**
 * Editorial hero title + lede. The `<em>` spans in `title` render in the
 * accent color with a soft underline; use them for emphasis (they match the
 * Merch Store design prototype).
 */
export function ShopHero({ title, lede }: { title: React.ReactNode; lede?: React.ReactNode }) {
	return (
		<div className="flex-1 min-w-0">
			<h1
				className="
          font-shop-display font-bold text-shop-text
          text-shop-display leading-[1.02] tracking-[-0.03em] m-0
          [&_em]:not-italic [&_em]:text-shop-accent [&_em]:relative
          [&_em]:after:content-[''] [&_em]:after:absolute [&_em]:after:inset-x-0
          [&_em]:after:-bottom-0.5 [&_em]:after:h-[3px]
          [&_em]:after:bg-shop-accent [&_em]:after:opacity-[0.35] [&_em]:after:rounded-sm
        "
			>
				{title}
			</h1>
			{lede ? (
				<p className="text-shop-text-2 text-shop-sm font-normal mt-3.5 max-w-[58ch] leading-[1.55] opacity-75">
					{lede}
				</p>
			) : null}
		</div>
	);
}
