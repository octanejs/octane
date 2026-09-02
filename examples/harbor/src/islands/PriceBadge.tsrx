// The simplest boundary proof: a stateless island that reads the React
// shell's REAL context objects with plain use(). A provider flip in React
// re-renders this island live — locale changes the Intl formatting, theme
// changes the data-theme attribute the stylesheet keys on.
import { use } from 'octane';
import { LocaleContext, ThemeContext } from '../shell/contexts.ts';

export interface PriceBadgeProps {
	pricePerSeat: number;
}

// The dark variant is a theme: an assigned <style> keeps every selector, and
// the badge's own <style apply={dark}> block applies it so these rules reach
// the badge's elements alongside the block's own. Declared above the component
// because a theme must precede the block that applies it.
const dark = <style>
	.price-badge[data-theme='dark'] {
		background: rgb(13, 17, 23);
		color: rgb(201, 209, 217);
	}
</style>;

export function PriceBadge(props: PriceBadgeProps) @{
	const locale = use(LocaleContext);
	const theme = use(ThemeContext);
	const price = new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: locale === 'de-DE' ? 'EUR' : 'USD',
		maximumFractionDigits: 0,
	}).format(props.pricePerSeat);
	<p class="price-badge" data-island="price-badge" data-theme={theme}>
		<strong class="price-badge-amount">{price}</strong>
		<span class="price-badge-unit">{' / seat / month'}</span>
		<style apply={dark}>
			.price-badge {
				display: inline-block;
				padding: 0.35rem 0.75rem;
				border-radius: 999px;
				border: 1px solid rgb(31, 111, 235);
			}
		</style>
	</p>
}
