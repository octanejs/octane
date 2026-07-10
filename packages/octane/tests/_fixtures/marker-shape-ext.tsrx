import { useState } from 'octane';

// Cross-module singleRoot component for marker-shape.test.ts (M1): hooked (so
// never lite), body renders ONE plain element → the compiler stamps
// `ExtLeaf.$$singleRoot = true` at this definition site, and a call site in
// ANOTHER module (marker-shape.tsrx's ChainX) elides its slot markers via the
// `componentSlot(…, 2)` sentinel.
export function ExtLeaf() @{
	const [n] = useState(7);
	<em class="ext">
		{'e:' + n}
	</em>
}
