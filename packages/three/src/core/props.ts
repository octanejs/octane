/**
 * Renderer-neutral Three property resolution, diffing, application, and disposal.
 *
 * Adapted from React Three Fiber v9.6.1's property utilities:
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/utils.tsx#L204-L216
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/utils.tsx#L256-L284
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/utils.tsx#L321-L389
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/utils.tsx#L392-L534
 *
 * Octane owns events, lifecycle callbacks, attachment, and disposal policy in
 * the universal driver. Consequently this module applies ordinary Three
 * properties only; renderer-reserved callbacks never become object fields.
 */
import * as THREE from 'three';

export type ThreePropBag = Readonly<Record<string, unknown>>;

export interface ResolvedProperty {
	readonly root: any;
	readonly key: string;
	readonly target: any;
}

export interface Disposable {
	type?: string;
	dispose?: () => void;
}

export interface ApplyThreePropsOptions {
	/** Apply R3F's managed-root sRGB texture conversion. */
	colorSpace?: boolean;
}

type PropertyApplication =
	| 'skip'
	| 'layers'
	| 'color'
	| 'copy'
	| 'array'
	| 'number'
	| 'uniforms'
	| 'assign';

interface PropertyBehaviorReader {
	readonly target: (key: 'set' | 'copy' | 'constructor' | 'fromArray' | 'setScalar') => unknown;
	readonly value: (key: 'constructor') => unknown;
}

export const THREE_RESERVED_PROPS = Object.freeze([
	'children',
	'key',
	'ref',
	'args',
	'dispose',
	'attach',
	'object',
	'onUpdate',
] as const);

const EVENT_PROP = /^on(Pointer|Click|DoubleClick|ContextMenu|Wheel)/;
const COLOR_MAPS = new Set(['map', 'emissiveMap', 'sheenColorMap', 'specularColorMap', 'envMap']);
const MEMOIZED_PROTOTYPES = new Map<Function, any>();
const THREE_CONSTRUCTORS = new Set<Function>(
	Object.values(THREE as unknown as Record<string, unknown>).filter(
		(value) => typeof value === 'function',
	) as Function[],
);
const UNKNOWN_SHAPE = Symbol('unknown Three property shape');

function isObject(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPropertyRoot(value: unknown): value is Record<string, any> {
	return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function isReservedProp(name: string): boolean {
	return (THREE_RESERVED_PROPS as readonly string[]).includes(name) || EVENT_PROP.test(name);
}

/**
 * Compare ordinary prop values with R3F's defaults: objects by identity and
 * arrays shallowly. The latter keeps newly allocated vector arrays from
 * producing property work when their entries are unchanged.
 */
function propsEqual(previous: unknown, next: unknown): boolean {
	if (previous === next) return true;
	if (typeof previous !== typeof next || Boolean(previous) !== Boolean(next)) return false;
	if (
		typeof previous === 'string' ||
		typeof previous === 'number' ||
		typeof previous === 'boolean'
	) {
		return previous === next;
	}
	if (!Array.isArray(previous) || !Array.isArray(next)) return false;

	let key: string | undefined;
	for (key in previous) {
		if (!(key in next) || previous[key] !== next[key]) return false;
	}
	for (key in next) {
		if (!(key in previous) || previous[key] !== next[key]) return false;
	}
	if (key === undefined) return previous.length === 0 && next.length === 0;
	return true;
}

function getMemoizedPrototype(root: any): any {
	const Constructor = root?.constructor as Function | undefined;
	if (Constructor === undefined) return undefined;
	let prototype = MEMOIZED_PROTOTYPES.get(Constructor);
	try {
		if (prototype === undefined) {
			prototype = new (Constructor as new () => any)();
			MEMOIZED_PROTOTYPES.set(Constructor, prototype);
		}
	} catch {
		return undefined;
	}
	return prototype;
}

/**
 * Resolve direct and dash-pierced properties. A real dashed property wins over
 * piercing, including when its current value is null or undefined.
 */
export function resolveProperty(root: any, key: string): ResolvedProperty {
	if (!key.includes('-')) return { root, key, target: root?.[key] };
	if (isPropertyRoot(root) && key in root) return { root, key, target: root[key] };

	let target = root;
	const parts = key.split('-');
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		if (!isPropertyRoot(target)) {
			return {
				root: target,
				key: parts.slice(index).join('-'),
				target: undefined,
			};
		}
		key = part;
		root = target;
		target = target[key];
	}
	return { root, key, target };
}

/**
 * Produce the ordinary Three property patch from two complete host snapshots.
 * Removed value-class properties reset from a memoized zero-argument instance,
 * matching R3F's Fast Refresh/default restoration behavior.
 */
export function diffThreeProps(
	object: unknown,
	next: ThreePropBag,
	previous: ThreePropBag = {},
): Record<string, unknown> {
	const changed: Record<string, unknown> = {};

	for (const prop in next) {
		if (isReservedProp(prop)) continue;
		if (propsEqual(next[prop], previous[prop])) continue;
		changed[prop] = next[prop];

		// A replaced root invalidates every explicitly pierced descendant, even
		// when the descendant's authored value is referentially unchanged.
		for (const other in next) {
			if (other.startsWith(`${prop}-`)) changed[other] = next[other];
		}
	}

	for (const prop in previous) {
		if (isReservedProp(prop) || Object.prototype.hasOwnProperty.call(next, prop)) continue;
		const { root, key } = resolveProperty(object, prop);
		const Constructor = root?.constructor as Function | undefined;
		if (Constructor !== undefined && Constructor.length === 0) {
			const prototype = getMemoizedPrototype(root);
			if (prototype !== undefined) changed[prop] = prototype[key];
		} else {
			changed[prop] = 0;
		}
	}

	return changed;
}

function isColorRepresentation(value: unknown): value is THREE.ColorRepresentation {
	return (
		value !== null &&
		(typeof value === 'string' ||
			typeof value === 'number' ||
			(value as THREE.Color).isColor === true)
	);
}

function applyColorSpace(root: Record<string, any>, key: string): void {
	if (!COLOR_MAPS.has(key)) return;
	const texture = root[key] as THREE.Texture | undefined;
	if (
		texture?.isTexture === true &&
		texture.format === THREE.RGBAFormat &&
		texture.type === THREE.UnsignedByteType
	) {
		texture.colorSpace = THREE.SRGBColorSpace;
	}
}

function getPropertyApplication(
	{ root, key, target }: ResolvedProperty,
	value: unknown,
	behavior?: PropertyBehaviorReader,
): PropertyApplication {
	const readTarget = behavior?.target ?? ((name) => target?.[name]);
	const readValue = behavior?.value ?? ((name) => (value as any)?.[name]);
	if (value === undefined) return 'skip';
	if (target instanceof THREE.Layers && value instanceof THREE.Layers) return 'layers';
	if (target instanceof THREE.Color && isColorRepresentation(value)) return 'color';
	if (
		target !== null &&
		typeof target === 'object' &&
		typeof readTarget('set') === 'function' &&
		typeof readTarget('copy') === 'function' &&
		readValue('constructor') !== undefined &&
		readTarget('constructor') === readValue('constructor')
	) {
		return 'copy';
	}
	if (
		target !== null &&
		typeof target === 'object' &&
		typeof readTarget('set') === 'function' &&
		Array.isArray(value)
	) {
		return 'array';
	}
	if (
		target !== null &&
		typeof target === 'object' &&
		typeof readTarget('set') === 'function' &&
		typeof value === 'number'
	) {
		return 'number';
	}
	if (root instanceof THREE.ShaderMaterial && key === 'uniforms' && isObject(value)) {
		return 'uniforms';
	}
	return 'assign';
}

type AppliedPathStatus = 'valid' | 'invalid' | 'uncertain';
type ShadowValue = PropertyShadow | typeof UNKNOWN_SHAPE | unknown;

class PropertyShadow {
	readonly overrides = new Map<string, ShadowValue>();
	uncertain = false;
	unsafeToAssign = false;

	constructor(readonly base: Record<string, any>) {}
}

interface ShadowState {
	readonly root: PropertyShadow;
	readonly cache: WeakMap<object, PropertyShadow>;
}

interface ResolvedShadowProperty {
	readonly root: ShadowValue;
	readonly key: string;
	readonly target: ShadowValue;
	readonly status: Exclude<AppliedPathStatus, 'valid'> | null;
}

function toShadow(value: unknown, cache: WeakMap<object, PropertyShadow>): ShadowValue {
	if (!isPropertyRoot(value)) return value;
	let shadow = cache.get(value);
	if (shadow === undefined) {
		shadow = new PropertyShadow(value);
		cache.set(value, shadow);
	}
	return shadow;
}

function fromShadow(value: ShadowValue): unknown {
	return value instanceof PropertyShadow ? value.base : value;
}

function getShadowValue(target: PropertyShadow, key: string, state: ShadowState): ShadowValue {
	if (target.overrides.has(key)) return target.overrides.get(key);
	if (target.uncertain) return UNKNOWN_SHAPE;
	return toShadow(target.base[key], state.cache);
}

function hasShadowValue(target: PropertyShadow, key: string): boolean | null {
	if (target.overrides.has(key)) return true;
	if (target.uncertain) return null;
	return key in target.base;
}

function readShadowMember(target: ShadowValue, key: string, state: ShadowState): ShadowValue {
	if (target === UNKNOWN_SHAPE) return UNKNOWN_SHAPE;
	if (target instanceof PropertyShadow) return getShadowValue(target, key, state);
	return toShadow((target as any)?.[key], state.cache);
}

function getShadowAssignmentStatus(target: PropertyShadow, key: string): AppliedPathStatus {
	if (target.overrides.has(key)) {
		return target.overrides.get(key) === UNKNOWN_SHAPE ? 'uncertain' : 'valid';
	}
	if (target.uncertain && target.unsafeToAssign) return 'uncertain';

	try {
		let owner: object | null = target.base;
		let own = true;
		while (owner !== null) {
			const descriptor = Object.getOwnPropertyDescriptor(owner, key);
			if (descriptor !== undefined) {
				if ('value' in descriptor) {
					if (descriptor.writable !== true) return 'invalid';
					return own || Object.isExtensible(target.base) ? 'valid' : 'invalid';
				}
				return descriptor.set === undefined ? 'invalid' : 'uncertain';
			}
			owner = Object.getPrototypeOf(owner);
			own = false;
		}
		return Object.isExtensible(target.base) ? 'valid' : 'invalid';
	} catch {
		return 'uncertain';
	}
}

function resolveShadowProperty(state: ShadowState, key: string): ResolvedShadowProperty {
	if (!key.includes('-')) {
		return {
			root: state.root,
			key,
			target: getShadowValue(state.root, key, state),
			status: null,
		};
	}

	const direct = hasShadowValue(state.root, key);
	if (direct === null) {
		return { root: UNKNOWN_SHAPE, key, target: UNKNOWN_SHAPE, status: 'uncertain' };
	}
	if (direct) {
		return {
			root: state.root,
			key,
			target: getShadowValue(state.root, key, state),
			status: null,
		};
	}

	let root: ShadowValue = state.root;
	let target: ShadowValue = state.root;
	const parts = key.split('-');
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		if (target === UNKNOWN_SHAPE) {
			return { root: target, key: part, target, status: 'uncertain' };
		}
		if (!(target instanceof PropertyShadow)) {
			return {
				root: target,
				key: parts.slice(index).join('-'),
				target: undefined,
				status: null,
			};
		}
		key = part;
		root = target;
		target = getShadowValue(target, key, state);
	}
	return { root, key, target, status: null };
}

function isKnownThreeValue(value: unknown): boolean {
	const Constructor = (value as { constructor?: unknown } | null)?.constructor;
	return typeof Constructor === 'function' && THREE_CONSTRUCTORS.has(Constructor);
}

function isCanonicalThreeMethod(value: unknown, key: string, method: unknown): boolean {
	if (!isKnownThreeValue(value)) return false;
	const Constructor = (value as { constructor: { prototype?: Record<string, unknown> } })
		.constructor;
	return Constructor.prototype?.[key] === method;
}

function markUnknownMutation(target: PropertyShadow, unsafeToAssign: boolean): void {
	target.overrides.clear();
	target.uncertain = true;
	target.unsafeToAssign ||= unsafeToAssign;
}

function replayUniforms(
	state: ShadowState,
	property: ResolvedShadowProperty,
	value: Record<string, any>,
): AppliedPathStatus {
	if (!(property.root instanceof PropertyShadow)) return 'invalid';
	let uniforms = property.target;
	if (uniforms === UNKNOWN_SHAPE) return 'uncertain';
	if (!isObject(fromShadow(uniforms))) {
		const assignment = getShadowAssignmentStatus(property.root, property.key);
		if (assignment !== 'valid') {
			if (assignment === 'uncertain') markUnknownMutation(property.root, true);
			return assignment;
		}
		uniforms = toShadow({}, state.cache);
		property.root.overrides.set(property.key, uniforms);
	}
	if (!(uniforms instanceof PropertyShadow)) return 'invalid';

	for (const name in value) {
		const uniform = value[name];
		const current = getShadowValue(uniforms, name, state);
		if (current === UNKNOWN_SHAPE) return 'uncertain';
		if (fromShadow(current) === undefined) {
			const assignment = getShadowAssignmentStatus(uniforms, name);
			if (assignment !== 'valid') {
				if (assignment === 'uncertain') markUnknownMutation(uniforms, true);
				return assignment;
			}
			uniforms.overrides.set(name, toShadow(Object.assign({}, uniform), state.cache));
		} else if (current instanceof PropertyShadow) {
			for (const key of Object.keys(Object(uniform))) {
				const assignment = getShadowAssignmentStatus(current, key);
				if (assignment !== 'valid') {
					if (assignment === 'uncertain') markUnknownMutation(current, true);
					return assignment;
				}
				current.overrides.set(key, toShadow(Object(uniform)[key], state.cache));
			}
		} else if (current === null) {
			return 'invalid';
		}
	}
	return 'valid';
}

function replayThreeProps(object: object, props: ThreePropBag): ShadowState | AppliedPathStatus {
	const cache = new WeakMap<object, PropertyShadow>();
	const root = toShadow(object, cache) as PropertyShadow;
	const state = { root, cache };

	for (const prop in props) {
		if (isReservedProp(prop)) continue;
		const value = props[prop];
		const property = resolveShadowProperty(state, prop);
		if (property.status !== null) return property.status;
		const resolved = {
			root: fromShadow(property.root),
			key: property.key,
			target: fromShadow(property.target),
		};
		if (resolved.target === undefined && !isPropertyRoot(resolved.root)) return 'invalid';

		const targetMembers = new Map<string, unknown>();
		const valueMembers = new Map<string, unknown>();
		const readMember = (
			shadow: ShadowValue,
			members: Map<string, unknown>,
			key: string,
		): unknown => {
			if (members.has(key)) return members.get(key);
			const member = readShadowMember(shadow, key, state);
			if (member === UNKNOWN_SHAPE) throw UNKNOWN_SHAPE;
			const result = fromShadow(member);
			members.set(key, result);
			return result;
		};
		const valueShadow = toShadow(value, cache);
		const behavior: PropertyBehaviorReader = {
			target: (key) => readMember(property.target, targetMembers, key),
			value: (key) => readMember(valueShadow, valueMembers, key),
		};
		let application: PropertyApplication;
		try {
			application = getPropertyApplication(resolved, value, behavior);
		} catch {
			return 'uncertain';
		}
		if (application === 'skip') continue;
		if (application === 'uniforms') {
			const status = replayUniforms(state, property, value as Record<string, any>);
			if (status !== 'valid') return status;
			continue;
		}
		if (application === 'assign') {
			if (!(property.root instanceof PropertyShadow)) return 'invalid';
			const assignment = getShadowAssignmentStatus(property.root, property.key);
			if (assignment === 'invalid') return assignment;
			if (assignment === 'uncertain') {
				markUnknownMutation(property.root, true);
				continue;
			}
			property.root.overrides.set(property.key, toShadow(value, cache));
			continue;
		}

		if (!(property.target instanceof PropertyShadow)) return 'invalid';
		let safeMutation = false;
		try {
			if (application === 'layers') {
				const assignment = getShadowAssignmentStatus(property.target, 'mask');
				if (assignment === 'invalid') return assignment;
				safeMutation = assignment === 'valid' && resolved.target?.constructor === THREE.Layers;
			} else if (application === 'color') {
				const set = behavior.target('set');
				if (typeof set !== 'function') return 'invalid';
				safeMutation =
					resolved.target?.constructor === THREE.Color &&
					isCanonicalThreeMethod(resolved.target, 'set', set);
			} else if (application === 'copy') {
				safeMutation = isCanonicalThreeMethod(resolved.target, 'copy', behavior.target('copy'));
			} else if (application === 'array') {
				const fromArray = behavior.target('fromArray');
				const method = typeof fromArray === 'function' ? fromArray : behavior.target('set');
				safeMutation = isCanonicalThreeMethod(
					resolved.target,
					typeof fromArray === 'function' ? 'fromArray' : 'set',
					method,
				);
			} else {
				const setScalar = behavior.target('setScalar');
				const method = typeof setScalar === 'function' ? setScalar : behavior.target('set');
				safeMutation = isCanonicalThreeMethod(
					resolved.target,
					typeof setScalar === 'function' ? 'setScalar' : 'set',
					method,
				);
			}
		} catch {
			return 'uncertain';
		}
		markUnknownMutation(property.target, !safeMutation);
	}
	return state;
}

/**
 * Inspect whether an attachment's leaf parent will still be object-like after
 * applying an ordered prop patch. This replays direct dashed-key precedence,
 * root replacement order, and known Three value-class setters without touching
 * the committed object. Unknown custom setter effects are reported separately.
 */
export function inspectAppliedThreePropsPath(
	object: object,
	path: string,
	props: ThreePropBag,
): AppliedPathStatus {
	const replay = replayThreeProps(object, props);
	if (!(typeof replay === 'object')) return replay;

	const direct = hasShadowValue(replay.root, path);
	if (direct === null) return 'uncertain';
	if (direct) return 'valid';

	let target: ShadowValue = replay.root;
	const parts = path.split('-');
	for (let index = 0; index < parts.length - 1; index++) {
		if (target === UNKNOWN_SHAPE) return 'uncertain';
		if (!(target instanceof PropertyShadow)) return 'invalid';
		target = getShadowValue(target, parts[index], replay);
	}
	if (target === UNKNOWN_SHAPE) return 'uncertain';
	return target instanceof PropertyShadow
		? target.unsafeToAssign
			? 'uncertain'
			: 'valid'
		: 'invalid';
}

/**
 * Apply ordinary Three properties. Passing `previous` makes this perform the
 * R3F-compatible diff first; omitting it applies the complete initial snapshot.
 */
export function applyThreeProps<T extends object>(
	object: T,
	next: ThreePropBag,
	previous?: ThreePropBag,
	options: ApplyThreePropsOptions = {},
): T {
	const props = previous === undefined ? next : diffThreeProps(object, next, previous);

	for (const prop in props) {
		if (isReservedProp(prop)) continue;
		const value = props[prop];

		const property = resolveProperty(object, prop);
		const { root, key, target } = property;
		if (target === undefined && !isPropertyRoot(root)) {
			throw new Error(
				`@octanejs/three: Cannot set ${JSON.stringify(prop)}. Ensure the parent is an object before setting ${JSON.stringify(key)}.`,
			);
		}

		const application = getPropertyApplication(property, value);
		if (application === 'skip') {
			continue;
		} else if (application === 'layers') {
			target.mask = (value as THREE.Layers).mask;
		} else if (application === 'color') {
			target.set(value);
		} else if (application === 'copy') {
			target.copy(value);
		} else if (application === 'array') {
			if (typeof target.fromArray === 'function') target.fromArray(value);
			else target.set(...(value as unknown[]));
		} else if (application === 'number') {
			if (typeof target.setScalar === 'function') target.setScalar(value);
			else target.set(value);
		} else if (application === 'uniforms') {
			if (!isObject(root.uniforms)) root.uniforms = {};
			const uniforms = value as Record<string, any>;
			for (const name in uniforms) {
				const uniform = uniforms[name];
				const current = root.uniforms[name];
				if (current !== undefined) Object.assign(current, uniform);
				else root.uniforms[name] = { ...uniform };
			}
		} else {
			if (!isPropertyRoot(root)) {
				throw new Error(`@octanejs/three: Cannot assign ${JSON.stringify(prop)}.`);
			}
			root[key] = value;
			if (options.colorSpace === true) applyColorSpace(root, key);
		}
	}

	return object;
}

/** Dispose an object and its directly-owned disposable properties. */
export function dispose<T extends Disposable>(object: T): void {
	if (object.type !== 'Scene') object.dispose?.();
	for (const name in object) {
		const value = object[name] as Disposable | undefined;
		if (value?.type !== 'Scene') value?.dispose?.();
	}
}
