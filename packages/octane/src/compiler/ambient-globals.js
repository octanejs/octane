// Language globals the compilers may treat as fixed, shared by the DOM and
// universal targets.

// Standard globals that only project their arguments. A user-defined
// `toString`/`valueOf`/`toJSON` that schedules a render violates the hook rules
// in React and Octane alike, so these count as call-free setup and render work
// (containsRenderCall).
export const SETUP_PURE_GLOBAL_CALLEES = new Set([
	'String',
	'Number',
	'Boolean',
	'BigInt',
	'Symbol',
	'parseInt',
	'parseFloat',
	'isNaN',
	'isFinite',
	'encodeURI',
	'encodeURIComponent',
	'decodeURI',
	'decodeURIComponent',
]);
// Namespace members that never invoke an argument. `Array.from`,
// `Object.groupBy`, `Object.fromEntries`, and friends iterate or call user
// code, so they stay unclassified. JSON's replacer and reviver positions are
// checked like a hook factory (see walkInvokedArgument).
export const SETUP_PURE_NAMESPACE_MEMBERS = new Map([
	['Math', null],
	[
		'Number',
		new Set(['isFinite', 'isInteger', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt']),
	],
	['Object', new Set(['entries', 'freeze', 'hasOwn', 'is', 'isFrozen', 'keys', 'values'])],
	['Array', new Set(['isArray', 'of'])],
	['Date', new Set(['now', 'parse', 'UTC'])],
	['JSON', new Set(['parse', 'stringify'])],
]);

// Globals a render-time read may treat as fixed: the value constants and the
// standard ECMAScript namespaces and constructors. Any other unbound name
// (`location`, `window`, `document`, `globalThis`, an app-installed global) is
// host or application state that no compiler witness observes.
export const IMMUTABLE_AMBIENT_GLOBALS = new Set([
	'undefined',
	'NaN',
	'Infinity',
	...SETUP_PURE_GLOBAL_CALLEES,
	...SETUP_PURE_NAMESPACE_MEMBERS.keys(),
	'Error',
	'TypeError',
	'RangeError',
	'RegExp',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Promise',
	'Reflect',
	'Intl',
]);
