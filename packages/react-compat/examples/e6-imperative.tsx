// E6 — forwardRef + useImperativeHandle. Upgrades the forwardRef story from
// "flagged in a blocked file" (E4) to an actual RUNTIME proof: the parent grabs
// an imperative handle through a ref prop and drives the child. This works
// because the compat shim turns forwardRef into a refs-as-props wrapper, so the
// ref simply arrives as `props.ref` and useImperativeHandle attaches to it.
import { forwardRef, useImperativeHandle, useState } from 'react';

export type StepperHandle = { step: () => void; get: () => number };

export const Stepper = forwardRef<StepperHandle, { start?: number }>(function Stepper(props, ref) {
	const [n, setN] = useState(props.start ?? 0);
	useImperativeHandle(ref, () => ({ step: () => setN((x) => x + 1), get: () => n }), [n]);
	return <span className="n">{n}</span>;
});
