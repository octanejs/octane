/** @jsxImportSource react */
import { OctaneCompat, type OctaneHostedComponent } from 'octane/react';

/** Create once at module scope so React preserves the native island across prop updates. */
export function asReact<P>(component: OctaneHostedComponent<P>) {
	return function OctaneWrapper(props: P) {
		return <OctaneCompat component={component} props={props} />;
	};
}
