// Island state + native events + the island→React return path. The seats
// input is CONTROLLED on octane's native event model (onInput fires per
// keystroke; there is no synthetic onChange), the total recomputes from
// island state, and "Add to compare" hands a plain object back to the React
// shell through a stable callback prop.
//
// Pre-hydration recovery: keystrokes typed into the server DOM before
// hydrateRoot ran never fired onInput, so adoption preserves the visible
// value while state still holds the server initial. The mount-time layout
// effect reads the adopted input ONCE and folds any pre-hydration edit into
// state, so the first "Add to compare" reports what the user actually typed.
import { use, useLayoutEffect, useRef, useState } from 'octane';
import type { Plan } from '../data/plans.ts';
import { LocaleContext } from '../shell/contexts.ts';

const MIN_SEATS = 1;
const MAX_SEATS = 500;

function clampSeats(raw: string | number): number {
	const parsed = Math.floor(Number(raw));
	if (!Number.isFinite(parsed)) return MIN_SEATS;
	return Math.min(MAX_SEATS, Math.max(MIN_SEATS, parsed));
}

/** What "Add to compare" hands back to the React shell. */
export interface CompareEntry {
	planId: string;
	seats: number;
}

export interface PlanConfiguratorProps {
	plan: Plan;
	onAddToCompare: (entry: CompareEntry) => void;
}

export function PlanConfigurator(props: PlanConfiguratorProps) @{
	const locale = use(LocaleContext);
	const [seats, setSeats] = useState(3);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useLayoutEffect(() => {
		const element = inputRef.current;
		if (element && element.value !== String(seats)) {
			setSeats(clampSeats(element.value));
		}
	}, []);
	const total = new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: locale === 'de-DE' ? 'EUR' : 'USD',
		maximumFractionDigits: 0,
	}).format(seats * props.plan.pricePerSeat);
	<section class="configurator" data-island="plan-configurator">
		<h3 class="configurator-title">{'Configure ' + props.plan.name}</h3>
		<div class="configurator-row">
			<button
				class="seats-step"
				data-step="down"
				aria-label="Fewer seats"
				onClick={() => setSeats(clampSeats(seats - 1))}
			>
				−
			</button>
			<label class="seats-label">
				{'Seats '}
				<input
					ref={inputRef}
					class="seats-input"
					type="number"
					min={MIN_SEATS}
					max={MAX_SEATS}
					value={seats}
					onInput={(event) => setSeats(clampSeats(event.currentTarget.value))}
				/>
			</label>
			<button
				class="seats-step"
				data-step="up"
				aria-label="More seats"
				onClick={() => setSeats(clampSeats(seats + 1))}
			>
				+
			</button>
		</div>
		<p class="configurator-total">
			{'Total '}
			<strong class="configurator-total-amount">{total}</strong>
			<span class="configurator-total-unit">{' / month'}</span>
		</p>
		<button
			class="add-to-compare"
			onClick={() => props.onAddToCompare({ planId: props.plan.id, seats })}
		>
			Add to compare
		</button>
	</section>
}
