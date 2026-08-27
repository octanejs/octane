/** @jsxImportSource octane */

import { useState } from 'octane';

let removeChild: (() => void) | null = null;
let invalidateChild: (() => void) | null = null;

function Child() {
	const [invalid, setInvalid] = useState(false);
	invalidateChild = () => setInvalid(true);
	if (invalid) throw new Error('a removed descendant rendered stale work');
	return <span className="child">child</span>;
}

export function SchedulerDepthOrderingApp() {
	const [showChild, setShowChild] = useState(true);
	removeChild = () => setShowChild(false);
	return <section>{showChild ? <Child /> : <span className="removed">removed</span>}</section>;
}

export function queueDescendantBeforeRemoval() {
	if (invalidateChild === null || removeChild === null) {
		throw new Error('scheduler fixture is not mounted');
	}
	invalidateChild();
	removeChild();
}
