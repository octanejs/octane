export const STRONG_RENDER_LOCALE_FORMAT = 'OCTANE_STRONG_RENDER_LOCALE_FORMAT';

export const STRONG_RANDOM_ID_MESSAGE =
	'Strong mode does not allow generating random IDs or bytes during render. Use useId() for element IDs; create other random values in an event handler and store them in state.';
const KEY_MESSAGE =
	'Strong mode does not allow a key computed from time or randomness during render; the element would get a new identity every render. Use a stable ID from the item, such as `item.id`.';

// Array methods that invoke their callback before returning. A callback passed to
// one of these runs in the caller's phase, so render rules apply inside it.
const SYNCHRONOUS_ARRAY_CALLBACKS = new Set([
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flatMap',
	'forEach',
	'map',
	'reduce',
	'reduceRight',
	'some',
	'sort',
	'toSorted',
]);
const RANDOM_CRYPTO_METHODS = new Set(['getRandomValues', 'randomUUID']);
const DATE_LOCALE_METHODS = new Set(['toLocaleDateString', 'toLocaleString', 'toLocaleTimeString']);
// Their text always names the runtime's time zone, whatever the Date was built from.
const DATE_ZONE_METHODS = new Set(['toString', 'toTimeString']);
// Intl services that default to the runtime's locale when none is passed.
const INTL_SERVICES = new Set([
	'Collator',
	'DateTimeFormat',
	'DisplayNames',
	'DurationFormat',
	'ListFormat',
	'NumberFormat',
	'PluralRules',
	'RelativeTimeFormat',
	'Segmenter',
]);
const DATE = { kind: 'date' };
const CRYPTO = { kind: 'crypto' };

/**
 * Render determinism rules that share the Strong visitor's phases and lexical
 * scopes. `visit` observes every visited node to remember proven Date, Intl and
 * crypto values by their declaring scope; the other hooks run only where the
 * visitor has already established a synchronous render phase. Nothing here
 * annotates the parser tree or changes emitted code.
 */
export function createStrongRenderPolicy({
	ast,
	moduleScope,
	report,
	reportImpureCall,
	resolve,
	resolveScope,
	unwrap,
	staticPrimitiveValue,
	isReassigned,
}) {
	const values = new WeakMap();
	const keys = [];
	// Most modules declare no Date, Intl or crypto values; skip their scope walks.
	let recorded = 0;
	let moduleFormatters = 0;

	function propertyName(member, scope) {
		if (member?.type !== 'MemberExpression') return null;
		return member.computed
			? staticPrimitiveValue(member.property, scope)
			: member.property?.type === 'Identifier'
				? member.property.name
				: null;
	}

	function unshadowed(expression, scope, name) {
		const value = unwrap(expression);
		return value?.type === 'Identifier' && value.name === name && resolve(scope, name) === null;
	}

	function aliasValue(expression, scope) {
		if (recorded === 0) return null;
		const value = unwrap(expression);
		if (value?.type !== 'Identifier') return null;
		const owner = resolveScope(scope, value.name);
		return owner === null ? null : (values.get(owner)?.get(value.name) ?? null);
	}

	function isDate(expression, scope) {
		const value = unwrap(expression);
		if (value?.type === 'NewExpression') return unshadowed(value.callee, scope, 'Date');
		return aliasValue(value, scope) === DATE;
	}

	// A spread in the locale or options position can supply both, so neither is
	// provably absent.
	function visibleArguments(node) {
		const args = node.arguments ?? [];
		return args.slice(0, 2).some((argument) => argument.type === 'SpreadElement') ? null : args;
	}

	function missingValue(argument, scope) {
		if (argument == null) return true;
		const value = unwrap(argument);
		return (
			(value?.type === 'ArrayExpression' && value.elements.length === 0) ||
			staticPrimitiveValue(value, scope) === undefined
		);
	}

	// Only a visible options object can prove the time zone is absent.
	function missingTimeZone(argument, scope) {
		if (missingValue(argument, scope)) return true;
		const options = unwrap(argument);
		if (options?.type !== 'ObjectExpression') return false;
		let timeZone = null;
		for (const property of options.properties) {
			if (property.type !== 'Property') return false;
			const key = property.computed
				? staticPrimitiveValue(property.key, scope)
				: (property.key?.name ?? property.key?.value);
			if (typeof key !== 'string' && typeof key !== 'number') return false;
			if (key === 'timeZone') timeZone = property;
		}
		return timeZone === null || missingValue(timeZone.value, scope);
	}

	// `Intl.X(...)` and `new Intl.X(...)` both construct a service.
	function intlService(node, scope) {
		const callee = unwrap(node?.callee);
		if (
			(node?.type !== 'CallExpression' && node?.type !== 'NewExpression') ||
			callee?.type !== 'MemberExpression' ||
			!unshadowed(callee.object, scope, 'Intl')
		) {
			return null;
		}
		const name = propertyName(callee, scope);
		if (!INTL_SERVICES.has(name)) return null;
		const args = visibleArguments(node);
		return {
			kind: 'intl',
			name,
			implicit:
				args !== null &&
				(missingValue(args[0], scope) ||
					(name === 'DateTimeFormat' && missingTimeZone(args[1], scope))),
		};
	}

	function classify(expression, scope) {
		const value = unwrap(expression);
		if (value?.type === 'NewExpression' && unshadowed(value.callee, scope, 'Date')) return DATE;
		const intl = intlService(value, scope);
		if (intl !== null) return intl;
		if (unshadowed(value, scope, 'crypto')) return CRYPTO;
		return aliasValue(value, scope);
	}

	function recordDeclaration(node, scope) {
		if (node.kind === 'var' || node.declare === true) return;
		for (const declaration of node.declarations ?? []) {
			const id = declaration.id;
			if (id?.type !== 'Identifier' || (node.kind !== 'const' && isReassigned(id))) continue;
			const value = classify(declaration.init, scope);
			if (value === null) continue;
			let names = values.get(scope);
			if (names === undefined) values.set(scope, (names = new Map()));
			if (!names.has(id.name)) {
				recorded++;
				if (scope === moduleScope && value.kind === 'intl' && value.implicit) moduleFormatters++;
			}
			names.set(id.name, value);
		}
	}

	// Components may precede the module formatter they read.
	for (const statement of ast.body ?? []) {
		const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (node?.type === 'VariableDeclaration') recordDeclaration(node, moduleScope);
	}

	function reportIntl(node, service, alias = false) {
		const example =
			service.name === 'DateTimeFormat'
				? "new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })"
				: `new Intl.${service.name}('en-US')`;
		const needs =
			service.name === 'DateTimeFormat' ? 'an explicit locale and time zone' : 'an explicit locale';
		report(
			STRONG_RENDER_LOCALE_FORMAT,
			node,
			`Strong mode does not allow ${alias ? `rendering with a module-level \`Intl.${service.name}\` created` : `\`Intl.${service.name}\``} without ${needs} during render; the server and the browser can format differently and break hydration. Pass ${service.name === 'DateTimeFormat' ? 'both' : 'one'}, for example \`${example}\`, or format in an event or effect and render the stored text.`,
		);
	}

	return {
		visit(node, scope) {
			if (node.type === 'VariableDeclaration') {
				recordDeclaration(node, scope);
			} else if (
				node.type === 'JSXAttribute' &&
				node.name?.type === 'JSXIdentifier' &&
				node.name.name === 'key' &&
				node.value != null
			) {
				keys.push(node.value);
			} else if (node.type === 'JSXForExpression' && node.key != null) {
				keys.push(node.key);
			}
		},

		/** The message for an impure call, specialized when it computes a key. */
		impureMessage(node, message) {
			const start = node.start ?? 0;
			const end = node.end ?? start;
			return keys.some((key) => key.start <= start && end <= key.end) ? KEY_MESSAGE : message;
		},

		/** Index of the argument a known array method calls before returning. */
		arrayCallbackIndex(callee, scope) {
			const member = unwrap(callee);
			const name = propertyName(member, scope);
			if (name === 'from' && unshadowed(member.object, scope, 'Array')) return 1;
			return SYNCHRONOUS_ARRAY_CALLBACKS.has(name) ? 0 : -1;
		},

		/** Checks a call that the visitor has proven runs during render. */
		call(node, callee, scope) {
			const member = unwrap(callee);
			const name = propertyName(member, scope);
			if (typeof name !== 'string') return;
			if (RANDOM_CRYPTO_METHODS.has(name)) {
				if (
					unshadowed(member.object, scope, 'crypto') ||
					aliasValue(member.object, scope) === CRYPTO
				) {
					reportImpureCall(member, STRONG_RANDOM_ID_MESSAGE);
				}
				return;
			}
			if (INTL_SERVICES.has(name)) {
				const service = intlService(node, scope);
				if (service?.implicit) reportIntl(callee, service);
				if (service !== null) return;
			}
			if (moduleFormatters !== 0) {
				const alias = aliasValue(member.object, scope);
				if (
					alias?.kind === 'intl' &&
					alias.implicit &&
					resolveScope(scope, unwrap(member.object).name) === moduleScope
				) {
					reportIntl(member, alias, true);
					return;
				}
			}
			const locale = DATE_LOCALE_METHODS.has(name);
			if ((!locale && !DATE_ZONE_METHODS.has(name)) || !isDate(member.object, scope)) return;
			const args = visibleArguments(node);
			if (
				locale &&
				args !== null &&
				(missingValue(args[0], scope) || missingTimeZone(args[1], scope))
			) {
				report(
					STRONG_RENDER_LOCALE_FORMAT,
					member,
					`Strong mode does not allow \`${name}()\` without an explicit locale and time zone during render; the server and the browser can format the same date differently and break hydration. Pass both, for example \`${name}('en-US', { timeZone: 'UTC' })\`, or format in an event or effect and render the stored text.`,
				);
			} else if (DATE_ZONE_METHODS.has(name)) {
				report(
					STRONG_RENDER_LOCALE_FORMAT,
					member,
					`Strong mode does not allow Date \`${name}()\` during render; its text includes the runtime's time zone, so server and browser output differ. Use \`toISOString()\`, or \`Intl.DateTimeFormat\` with an explicit locale and \`timeZone\`.`,
				);
			}
		},

		/** Checks a `new` expression that the visitor has proven runs during render. */
		construct(node, scope) {
			const callee = unwrap(node.callee);
			if (callee?.type !== 'MemberExpression' || !INTL_SERVICES.has(propertyName(callee, scope)))
				return;
			const service = intlService(node, scope);
			if (service?.implicit) reportIntl(node.callee, service);
		},
	};
}
