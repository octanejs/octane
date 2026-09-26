import { base } from './style-applied-theme-base.tsrx';

const theme = <style apply={base}>
	div {
		color: blue;
	}
	.card {
		color: var(--ink);
	}
</style>;

const cls = theme.$class;
const card = theme.card;

export function App({ entry }: { entry: boolean }) @{
	<div class={entry ? card : cls}>Probe</div>
}
