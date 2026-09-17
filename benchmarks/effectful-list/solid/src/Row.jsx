import { createEffect, onCleanup, onSettled, getOwner } from 'solid-js';
import { fx, rowRef, setRowOwner } from './fx.js';

// Solid 2.0 Row — the fine-grained equivalent of the hook-based rows:
//
//   * mount/cleanup: onSettled (Solid 2.0's onMount) runs once after the row's
//     first commit, and onCleanup in the component body runs once on row
//     disposal — together the useEffect-[item.id] equivalent (keyed rows never
//     change id in place).
//   * useLayoutEffect-[item.value] equivalent: the compute tracks item.value
//     (a store leaf signal — reconcile updates it in place for same-id rows);
//     the untracked effect phase does the layout read on probe rows only.
//   * ref={rowRef} — the shared module-level ref (see fx.js for the
//     onCleanup-based cleanup divergence).
//
// The row body runs ONCE per row lifetime — parent re-renders don't exist in
// the fine-grained model, which is why update_nodeps is a ~zero for Solid.

export default function Row(props) {
	const item = props.item; // store row proxy — property reads are fine-grained
	let cell;

	// Hand this row's reactive owner to the shared rowRef: Solid 2.0 invokes the
	// ref outside any owner, so the ref-cleanup must be attached to the owner
	// captured HERE (in the body), which <For> disposes on row removal.
	setRowOwner(getOwner());

	onSettled(() => {
		fx.mounts++;
	});
	onCleanup(() => {
		fx.cleanups++;
	});

	createEffect(
		() => item.value,
		() => {
			if (item.probe) {
				fx.h += cell.offsetHeight;
				fx.layouts++;
			}
		},
	);

	return (
		<tr ref={rowRef}>
			<td class="col-id" ref={cell} textContent={item.id} />
			<td class="col-label" textContent={item.label} />
			<td class="col-value" textContent={item.value} />
		</tr>
	);
}
