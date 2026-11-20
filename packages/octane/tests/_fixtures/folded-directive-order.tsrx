// A directive that follows a component among returned children passed to a
// component. Each directive folds into the returned fragment's renderer while
// the sibling component does not (#3094).

function Outer({ children }: { children?: unknown }) {
	return <div id="outer">{children}</div>;
}

function List({ children }: { children?: unknown }) {
	return <ul>{children}</ul>;
}

export function ForAfterComponent({ rows }: { rows: string[] }) {
	return (
		<Outer>
			<List>
				@for (const x of rows; key x) {
					<li>{x}</li>
				}
			</List>
			@for (const x of rows; key x) {
				<p>{x}</p>
			}
		</Outer>
	);
}

export function IfAfterComponent({ rows }: { rows: string[] }) {
	return (
		<Outer>
			<List>
				@for (const x of rows; key x) {
					<li>{x}</li>
				}
			</List>
			@if (rows.length > 0) {
				<p>{rows.length as unknown as string}</p>
			}
		</Outer>
	);
}

export function SwitchAfterComponent({ rows }: { rows: string[] }) {
	return (
		<Outer>
			<List>
				@for (const x of rows; key x) {
					<li>{x}</li>
				}
			</List>
			@switch (rows.length) {
				@case 0: {
					<p>none</p>
				}
				@default: {
					<p>some</p>
				}
			}
		</Outer>
	);
}
