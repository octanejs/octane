import App from './exported-component-composition.tsrx';
import type { EntryParentProps } from './exported-component-composition.tsrx';

export function ImportedParent(props: EntryParentProps) @{
	<main data-tick={String(props.tick)}>
		<strong>before</strong>
		<App />
		<em>after</em>
		<input aria-label="draft" defaultValue="seed" />
		<button onClick={props.onPick}>pick</button>
	</main>
}
