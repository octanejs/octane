function requireFunction(target, name) {
	const value = target[name];
	if (typeof value !== 'function') {
		throw new Error(`Octane Lynx Phase 0 requires the Element PAPI function ${name}.`);
	}
	return value;
}

export function createPhase0PAPIAdapter(target = globalThis) {
	const createPage = requireFunction(target, '__CreatePage');
	const createElement = requireFunction(target, '__CreateElement');
	const createText = requireFunction(target, '__CreateText');
	const createView = requireFunction(target, '__CreateView');
	const createRawText = requireFunction(target, '__CreateRawText');
	const getUniqueId = requireFunction(target, '__GetElementUniqueID');
	const appendElement = requireFunction(target, '__AppendElement');
	const setAttribute = requireFunction(target, '__SetAttribute');
	const addDataset = requireFunction(target, '__AddDataset');
	const addEvent = requireFunction(target, '__AddEvent');
	const removeElement = requireFunction(target, '__RemoveElement');
	const flushElementTree = requireFunction(target, '__FlushElementTree');
	const getParent = target.__GetParent;
	const elementIsEqual = target.__ElementIsEqual;

	const page = createPage('0', 0);
	let flushCount = 0;

	return Object.freeze({
		page,
		create(hostType, parent, text) {
			if (hostType === 'raw-text') {
				return createRawText(text);
			}
			if (hostType === 'text') {
				return createText(getUniqueId(parent));
			}
			if (hostType === 'view') {
				return createView(getUniqueId(parent));
			}
			return createElement(hostType, getUniqueId(parent));
		},
		append(parent, child) {
			appendElement(parent, child);
		},
		setDataset(element, name, value) {
			addDataset(element, name, value);
		},
		setEvent(element, eventType, eventName, listenerId) {
			addEvent(element, eventType, eventName, listenerId);
		},
		setText(element, value) {
			setAttribute(element, 'text', value);
		},
		isChild(parent, child) {
			if (typeof getParent === 'function') {
				if (typeof elementIsEqual !== 'function') {
					throw new Error(
						'Octane Lynx Phase 0 requires the Element PAPI function __ElementIsEqual.',
					);
				}
				const actualParent = getParent(child);
				return actualParent != null && elementIsEqual(actualParent, parent);
			}
			// @lynx-js/testing-environment@0.3.0 does not expose the typed
			// __GetParent PAPI primitive, but its ElementRefs are DOM nodes.
			if (
				target.lynxTestingEnv !== undefined &&
				child !== null &&
				typeof child === 'object' &&
				'parentNode' in child
			) {
				return child.parentNode === parent;
			}
			throw new Error('Octane Lynx Phase 0 requires the Element PAPI function __GetParent.');
		},
		remove(parent, child) {
			removeElement(parent, child);
		},
		flush() {
			flushElementTree(page);
			flushCount += 1;
		},
		get flushCount() {
			return flushCount;
		},
	});
}
