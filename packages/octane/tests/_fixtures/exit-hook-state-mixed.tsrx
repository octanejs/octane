import { useEffect, useState } from 'octane';
import { Canvas } from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx';

// One component, two renderers: the DOM rows compile with the DOM compiler and
// the Canvas rows with the universal compiler. A row's state after its exit
// has one lifetime on both.
export function MixedExitRows(props: {
	rows: string[];
	hidden: string[];
	allocate: () => string;
	log: string[];
	root: unknown;
}) @{
	<section>
		@for (const row of props.rows; key row) {
			if (props.hidden.includes(row)) continue;
			const [mount] = useState(props.allocate);
			useEffect(() => {
				props.log.push('dom mount ' + row);
				return () => {
					props.log.push('dom cleanup ' + row);
				};
			}, []);
			<item name={row} mount={mount} />
		}
		<Canvas root={props.root}>
			@for (const row of props.rows; key row) {
				if (props.hidden.includes(row)) return;
				const [mount] = useState(props.allocate);
				useEffect(() => {
					props.log.push('object mount ' + row);
					return () => {
						props.log.push('object cleanup ' + row);
					};
				}, []);
				<item name={row} mount={mount} />
			}
		</Canvas>
	</section>
}
