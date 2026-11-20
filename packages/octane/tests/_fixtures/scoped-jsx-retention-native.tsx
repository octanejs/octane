/** @jsxImportSource octane */

// A runtime signals import compiles this module's JSX with native reads.
import 'octane/signals';
import type { OctaneNode } from 'octane';
import {
	Disclosure,
	disclosureLabels,
	type DisclosureOwnerProps,
} from './scoped-jsx-retention.tsx';

function Row(props: { children?: OctaneNode }) {
	return <li data-row="">{props.children}</li>;
}

export function NativeDisclosureOwner(props: DisclosureOwnerProps) {
	return (
		<Disclosure bind={props.bind}>
			{disclosureLabels.map((label) => (
				<Row key={label}>{label}</Row>
			))}
		</Disclosure>
	);
}
