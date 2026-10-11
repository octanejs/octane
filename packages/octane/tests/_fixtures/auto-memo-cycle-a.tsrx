import { AutoMemoCycleB, AutoMemoCycleLeaf } from './auto-memo-cycle-b.tsrx';

// A pure component that recurses through another module's pure component, so
// the definition-site proofs of both exports read each other's witness.
export function AutoMemoCycleA(props: { depth: number; label: string }) @{
	<div class="cycle-a">
		@if (props.depth > 0) {
			<AutoMemoCycleB depth={props.depth - 1} label={props.label} />
		} @else {
			<AutoMemoCycleLeaf label={props.label} />
		}
	</div>
}
