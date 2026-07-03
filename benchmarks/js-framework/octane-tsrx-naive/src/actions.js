// The imported "actions" object the Row component dispatches through —
// `onClick={() => actions.select(id)}` is a MEMBER-callee arrow, which octane's
// compiler deliberately does NOT event-bundle (the `{ fn, args }` bundle + skip
// optimization only fires for identifier-callee arrows). Every re-render of a
// row therefore reassigns its handler slots — one of the naive-authoring costs
// this fixture measures. Main binds the real implementations during render
// (they close over the current useState setters), dbmon-ops.js style.
export const actions = {
	select: (_id) => {},
	remove: (_row) => {},
};

export function bindActions(select, remove) {
	actions.select = select;
	actions.remove = remove;
}
