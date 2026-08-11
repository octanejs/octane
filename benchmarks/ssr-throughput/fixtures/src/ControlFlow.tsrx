import { CARDS } from './deopt-data';

// Each row exercises two fully specified host-only branch slots. Both modes
// render the same visible content; the payload audit compares their public
// hydratable/static markup before attributing any bytes to range ownership.
export function ControlFlowPage() @{
	<section class="control-flow">
		@for (const card of CARDS; key card.id) {
			<article class="control-row" data-id={card.id}>
				@if (card.featured) {
					<strong class="featured">{card.name as string}</strong>
				} @else {
					<span class="ordinary">{card.name as string}</span>
				}
				@switch (card.id % 3) {
					@case 0: {
						<em class="tier">zero</em>
					}
					@case 1: {
						<em class="tier">one</em>
					}
					@default: {
						<em class="tier">two</em>
					}
				}
			</article>
		}
	</section>
}
