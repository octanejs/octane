/** @jsxImportSource octane */

import { useState, type OctaneNode } from 'octane';

export interface DisclosureControls {
	toggle(): void;
}

export interface DisclosureOwnerProps {
	bind(controls: DisclosureControls): void;
}

export const disclosureLabels = ['One', 'Two', 'Three'];

export function Disclosure(props: DisclosureOwnerProps & { children?: OctaneNode }) {
	const [open, setOpen] = useState(false);
	props.bind({ toggle: () => setOpen((value) => !value) });
	return open ? <ul data-disclosure="">{props.children}</ul> : null;
}

// Not exported: in dev, the HMR wrapper of an exported component holds each of
// its blocks until the next hot update.
function Row(props: { children?: OctaneNode }) {
	return <li data-row="">{props.children}</li>;
}

// The owner renders once, so every open renders the same row elements, each
// with expression children, inside a fresh subtree.
export function DisclosureOwner(props: DisclosureOwnerProps) {
	return (
		<Disclosure bind={props.bind}>
			{disclosureLabels.map((label) => (
				<Row key={label}>{label}</Row>
			))}
		</Disclosure>
	);
}
