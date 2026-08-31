import * as React from 'react';
import { createElement, useLayoutEffect } from 'octane';
import { OctaneCompat } from 'octane/react';

const EFFECT = Symbol('lifetime');

function NativeLeaf(props: { label: string; onCleanup: () => void }) {
	useLayoutEffect(() => props.onCleanup, [], EFFECT);
	return createElement('button', null, props.label);
}

/** Library boundary: the consuming verifier supplies its own React DOM root. */
export function makeOctaneCompatControl(label: string, onCleanup: () => void) {
	return React.createElement(
		OctaneCompat,
		null,
		React.createElement(NativeLeaf as never, { label, onCleanup } as never),
	);
}
