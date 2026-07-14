import * as upstreamReact from '@apollo/client/react';
import * as octaneReact from '@octanejs/apollo-client/react';
import { describe, expect, it } from 'vitest';

describe('@octanejs/apollo-client/react export surface', () => {
	it('provides every runtime export from @apollo/client/react', () => {
		const port = new Set(Object.keys(octaneReact));
		const missing = Object.keys(upstreamReact)
			.filter((name) => !port.has(name))
			.sort();
		expect(missing).toEqual([]);
	});

	it('does not expose runtime names absent from @apollo/client/react', () => {
		const upstream = new Set(Object.keys(upstreamReact));
		const extras = Object.keys(octaneReact)
			.filter((name) => !upstream.has(name))
			.sort();
		expect(extras).toEqual([]);
	});
});
