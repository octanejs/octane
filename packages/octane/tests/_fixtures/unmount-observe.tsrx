import { useLayoutEffect } from 'octane';

// Deletion-phase observation fixtures: each Observed leaf records, at the
// moment its LAYOUT cleanup fires, what `observe()` can still see in the
// document. React runs every deletion destroy before it removes any DOM, so a
// cleanup must be able to observe the ENTIRE deleted subtree still connected —
// including siblings whose cleanups already ran.

interface ObservedProps {
	id: string;
	log: (entry: string) => void;
	observe: () => string;
}

export function Observed(props: ObservedProps) @{
	useLayoutEffect(() => {
		return () => props.log(props.id + ' cleanup sees ' + props.observe());
	}, []);
	<span class={'obs ' + props.id}>{props.id}</span>
}

interface PairProps {
	log: (entry: string) => void;
	observe: () => string;
}

// Two component children of one host — each child renders through its own
// block, which is the shape where a per-block DOM detach would let the second
// cleanup observe the first sibling already gone.
export function Pair(props: PairProps) @{
	<div class="pair">
		<Observed id="first" log={props.log} observe={props.observe} />
		<Observed id="second" log={props.log} observe={props.observe} />
	</div>
}

interface ToggleProps {
	show: boolean;
	log: (entry: string) => void;
	observe: () => string;
}

export function Toggle(props: ToggleProps) @{
	<div class="host">
		@if (props.show) {
			<Pair log={props.log} observe={props.observe} />
		} @else {
			<em class="off">off</em>
		}
	</div>
}

interface RouteProps {
	route: string;
	log: (entry: string) => void;
	observe: () => string;
}

// The SPA-navigation shape: a @switch outlet swapping route arms.
export function Routes(props: RouteProps) @{
	<div class="outlet">
		@switch (props.route) {
			@case 'a': {
				<section class="page-a">
					<Pair log={props.log} observe={props.observe} />
				</section>
			}
			@default: {
				<section class="page-b">page b</section>
			}
		}
	</div>
}

interface ListProps {
	items: { id: string }[];
	log: (entry: string) => void;
	observe: () => string;
}

// Keyed item removal: the removed item's cleanup must observe its own item
// subtree still connected.
export function List(props: ListProps) @{
	<ul class="list">
		@for (const item of props.items; key item.id) {
			<li class={'item ' + item.id}>
				<Observed id={item.id} log={props.log} observe={props.observe} />
			</li>
		}
	</ul>
}
