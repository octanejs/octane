/** @jsxImportSource octane */

// A props-driven `{items.map(...)}` list that compiles to the guarded map ABI,
// so the runtime decides PER RENDER whether the array is a plain native array —
// replayed through the compiled item body — or something exotic (a hole, an
// accessor index, a tampered `map`), which falls back to applying the authored
// callback and rendering the resulting descriptors as a de-opt list.
//
// The rows are COMPONENT items on purpose. A pure single-element host descriptor
// self-delimits during hydration whether or not the list is a plain de-opt list,
// so it cannot tell the two regimes apart; a component-bearing item keeps its
// explicit `<!--it-->` pair only on the mapped-fallback path.
function Row(props: { id: number; label: string }) {
	return (
		<li className="fallback-row" data-id={props.id}>
			{props.label}
		</li>
	);
}

export function MappedFallbackList(props: { items: Array<{ id: number; label: string }> }) {
	return (
		<ul className="fallback-list">
			{props.items.map((item) => (
				<Row key={item.id} id={item.id} label={item.label} />
			))}
		</ul>
	);
}
