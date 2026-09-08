const inspectableValueChildren = Symbol.for('octane.react-select.inspectable-value-children');

export function markInspectableValueChildren<T extends Function>(component: T): T {
	Object.defineProperty(component, inspectableValueChildren, { value: true });
	return component;
}

export function needsInspectableValueChildren(component: Function): boolean {
	return (component as unknown as Record<PropertyKey, unknown>)[inspectableValueChildren] === true;
}
