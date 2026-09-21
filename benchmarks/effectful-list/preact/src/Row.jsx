import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { fx, rowRef } from './fx.js';

// Preact Row — IDENTICAL hook code to octane-jsx's Row.tsx (only the import
// source differs). Cross-module, not memo'd: every parent re-render re-invokes
// all 1000 bodies, so deps-array Object.is churn is part of what's measured.
//
//   * useEffect deps [item.id]   — fires once per keyed-row lifetime; the
//     returned cleanup runs on unmount.
//   * useLayoutEffect deps [item.value] — refires per value change; layout
//     read (offsetHeight) only on probe rows (every 10th).
//   * ref={rowRef} — SHARED module-level callback ref returning a cleanup
//     (Preact callback-ref cleanup semantics; stable identity means re-renders must
//     NOT re-invoke it).
//   * window.__renders.row++ — the body's first statement: the invocation
//     probe the harness's renders gate asserts exact per-op counts on.
//   * props.tick — the parent's per-update state, passed in so each
//     update_nodeps bump is a REAL props change; deliberately never rendered.

export default function Row(props) {
	window.__renders.row++;
	const item = props.item;
	const cell = useRef(null);
	// Preact stores a callback-ref cleanup on the callback function itself, so
	// sharing one function directly across many nodes would retire the previous
	// node's cleanup on each attachment. Keep a stable per-row adapter while
	// preserving the benchmark's shared rowRef implementation.
	const ref = useCallback((element) => rowRef(element), []);

	useEffect(() => {
		fx.mounts++;
		return () => {
			fx.cleanups++;
		};
	}, [item.id]);

	useLayoutEffect(() => {
		if (item.probe) {
			fx.h += cell.current.offsetHeight;
			fx.layouts++;
		}
	}, [item.value]);

	return (
		<tr ref={ref}>
			<td className="col-id" ref={cell}>
				{item.id}
			</td>
			<td className="col-label">{item.label}</td>
			<td className="col-value">{item.value}</td>
		</tr>
	);
}
