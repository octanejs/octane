import { AutoMemoSwapCurrent } from './auto-memo-imported-swap.tsrx';

// The imported tag is a live binding: its region witnesses whichever component
// the binding names when the parent renders.
export function AutoMemoSwapApp(props: { label: string; tick: number }) @{
	<section data-tick={props.tick}>
		<AutoMemoSwapCurrent label={props.label} />
	</section>
}
