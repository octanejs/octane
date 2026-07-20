import { useState } from 'octane';

/**
 * Island content for the §9.3 opaque-host hydration spike. Deliberately small
 * but not trivial: static markup, a dynamic text hole, and a delegated click
 * handler so adoption (node identity + live events + preserved state) is
 * observable after React hydrates around the host.
 */
export function HydrationIsland(props) @{
	const [count, setCount] = useState(0);
	<section class="hy-island">
		<h3 class="hy-title">{'island ' + props.name}</h3>
		<button class="hy-count" onClick={() => setCount(count + 1)}>{'clicks:' + count}</button>
	</section>
}
