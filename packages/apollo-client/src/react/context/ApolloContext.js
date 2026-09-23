import { createContext } from 'octane';
import { invariant } from '@apollo/client/utilities/invariant';
// To make sure Apollo Client doesn't create more than one React context
// (which can lead to problems like having an Apollo Client instance added
// in one context, then attempting to retrieve it from another different
// context), a single Apollo context is created and tracked in global state.
const contextKey = Symbol.for('__APOLLO_CONTEXT__');
export function getApolloContext() {
	// DEVIATION: upstream checks `'createContext' in React` on the namespace
	// import. An `in` test forces bundlers to materialize the whole `octane`
	// namespace object, retaining every public export; a named import keeps the
	// same guard tree-shakeable.
	invariant(typeof createContext === 'function', 37);
	let context = createContext[contextKey];
	if (!context) {
		Object.defineProperty(createContext, contextKey, {
			value: (context = createContext({})),
			enumerable: false,
			writable: false,
			configurable: true,
		});
		context.displayName = 'ApolloContext';
	}
	return context;
}
