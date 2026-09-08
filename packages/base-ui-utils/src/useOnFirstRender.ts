/** @jsxImportSource octane */
'use client';
import * as React from 'octane';

export function useOnFirstRender(fn: Function) {
	const ref = React.useRef(true);
	if (ref.current) {
		ref.current = false;
		fn();
	}
}
