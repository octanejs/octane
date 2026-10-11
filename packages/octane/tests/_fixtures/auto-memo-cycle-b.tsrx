import { AutoMemoCycleA } from './auto-memo-cycle-a.tsrx';

export let autoMemoCycleValue = 'v0';

export function setAutoMemoCycleValue(value: string): void {
	autoMemoCycleValue = value;
}

export function AutoMemoCycleB(props: { depth: number; label: string }) @{
	<div class="cycle-b">
		<AutoMemoCycleA depth={props.depth} label={props.label} />
	</div>
}

// No proof can witness a module `let`, so the cycle's subtree stays unproven.
export function AutoMemoCycleLeaf(props: { label: string }) @{
	<span class="cycle-leaf">{(props.label + ':' + autoMemoCycleValue) as string}</span>
}
