import { actions } from './actions.js';

// The naive-authoring row: everything a React dev naturally reaches for, each of
// which knocks octane off a tuned path (see ../../README-naive.md):
//   * a CROSS-MODULE component per row — every row is a componentSlot Block
//     (per-row `<!--comp-->` anchors, per-row scope) instead of a template-cloned
//     `<tr>` inside the parent's forBlock body.
//   * `<tr {...rowAttrs}>` — a spread object built fresh every render routes
//     the row's attributes through the generic spread diff instead of a
//     compiled per-binding write.
//   * member-callee handlers via the imported `actions` object — defeats the
//     event-bundle transform, so handler slots reassign on every row re-render.
//   * an inline style OBJECT on a cell — value-dependent (a constant object
//     literal would be folded into the static template), so a fresh object
//     identity per render forces the style differ to walk its keys every time.
//
// `onSelect`/`onRemove` are also accepted as props (the React prop contract for
// a list row); dispatch flows through the same imported `actions` module they
// are bound from, keeping the DOM handlers member-callee.
export default function Row({ item, selected, onSelect, onRemove }) @{
	const rowAttrs = { class: selected ? 'danger' : '' };

	<tr {...rowAttrs}>
		<td class="col-md-1">{item.id as string}</td>
		<td class="col-md-4">
			<a onClick={() => actions.select(item.id)}>{item.label as string}</a>
		</td>
		<td class="col-md-1">
			<a onClick={() => actions.remove(item)}>
				<span class="glyphicon glyphicon-remove" aria-hidden="true" />
			</a>
		</td>
		<td class="col-md-6" style={{ fontWeight: selected ? 'bold' : 'normal' }} />
	</tr>
}
