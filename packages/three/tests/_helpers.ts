import * as THREE from 'three';

export type CanonicalThreeValue =
	| null
	| boolean
	| number
	| string
	| readonly CanonicalThreeValue[]
	| { readonly [key: string]: CanonicalThreeValue };

export interface CanonicalThreeResource {
	readonly type: string;
	readonly name: string;
	readonly properties?: Readonly<Record<string, CanonicalThreeValue>>;
}

export interface CanonicalThreeObject {
	readonly type: string;
	readonly name: string;
	readonly visible: boolean;
	readonly position: readonly [number, number, number];
	readonly rotation: readonly [number, number, number, string];
	readonly scale: readonly [number, number, number];
	readonly castShadow: boolean;
	readonly receiveShadow: boolean;
	readonly renderOrder: number;
	readonly geometry?: CanonicalThreeResource;
	readonly material?: CanonicalThreeResource | readonly CanonicalThreeResource[];
	readonly userData?: Readonly<Record<string, CanonicalThreeValue>>;
	readonly children: readonly CanonicalThreeObject[];
}

function canonicalNumber(value: number): number {
	return Object.is(value, -0) ? 0 : value;
}

function canonicalValue(
	value: unknown,
	seen: ReadonlySet<object>,
): CanonicalThreeValue | undefined {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
	if (typeof value === 'number')
		return Number.isFinite(value) ? canonicalNumber(value) : String(value);
	if (Array.isArray(value)) {
		return value.map((item) => canonicalValue(item, seen) ?? null);
	}
	if (typeof value !== 'object') return undefined;
	if (seen.has(value)) return undefined;

	if ((value as THREE.Color).isColor) return `#${(value as THREE.Color).getHexString()}`;
	if ((value as THREE.Vector2).isVector2) {
		const vector = value as THREE.Vector2;
		return [canonicalNumber(vector.x), canonicalNumber(vector.y)];
	}
	if ((value as THREE.Vector3).isVector3) {
		const vector = value as THREE.Vector3;
		return [canonicalNumber(vector.x), canonicalNumber(vector.y), canonicalNumber(vector.z)];
	}
	if ((value as THREE.Euler).isEuler) {
		const euler = value as THREE.Euler;
		return [
			canonicalNumber(euler.x),
			canonicalNumber(euler.y),
			canonicalNumber(euler.z),
			euler.order,
		];
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return undefined;

	const nextSeen = new Set(seen);
	nextSeen.add(value);
	const output: Record<string, CanonicalThreeValue> = {};
	for (const key of Object.keys(value).sort()) {
		if (key === 'uuid' || key.startsWith('__')) continue;
		const canonical = canonicalValue((value as Record<string, unknown>)[key], nextSeen);
		if (canonical !== undefined) output[key] = canonical;
	}
	return output;
}

function serializeResource(
	resource: THREE.BufferGeometry | THREE.Material,
): CanonicalThreeResource {
	const properties: Record<string, CanonicalThreeValue> = {};
	if ((resource as THREE.BufferGeometry).isBufferGeometry) {
		const parameters = canonicalValue(
			(resource as THREE.BufferGeometry & { parameters?: unknown }).parameters ?? {},
			new Set([resource]),
		);
		if (parameters !== undefined) properties.parameters = parameters;
	} else {
		const material = resource as THREE.Material & {
			color?: THREE.Color;
			wireframe?: boolean;
		};
		if (material.color?.isColor) properties.color = `#${material.color.getHexString()}`;
		properties.opacity = canonicalNumber(material.opacity);
		properties.transparent = material.transparent;
		properties.side = material.side;
		properties.visible = material.visible;
		if (typeof material.wireframe === 'boolean') properties.wireframe = material.wireframe;
	}
	return {
		type: resource.type,
		name: resource.name,
		...(Object.keys(properties).length === 0 ? {} : { properties }),
	};
}

/**
 * Describe a live Three scene using public, deterministic graph state only.
 * Runtime bookkeeping, generated UUIDs, and object allocation identity are
 * deliberately excluded; identity-sensitive contracts are asserted beside
 * the serialized graph comparison.
 */
export function serializeThreeGraph(object: THREE.Object3D): CanonicalThreeObject {
	const renderable = object as THREE.Object3D & {
		geometry?: THREE.BufferGeometry;
		material?: THREE.Material | THREE.Material[];
	};
	const userData = canonicalValue(object.userData, new Set([object]));
	const canonicalUserData =
		userData !== null &&
		typeof userData === 'object' &&
		!Array.isArray(userData) &&
		Object.keys(userData).length > 0
			? (userData as Readonly<Record<string, CanonicalThreeValue>>)
			: undefined;
	return {
		type: object.type,
		name: object.name,
		visible: object.visible,
		position: [
			canonicalNumber(object.position.x),
			canonicalNumber(object.position.y),
			canonicalNumber(object.position.z),
		],
		rotation: [
			canonicalNumber(object.rotation.x),
			canonicalNumber(object.rotation.y),
			canonicalNumber(object.rotation.z),
			object.rotation.order,
		],
		scale: [
			canonicalNumber(object.scale.x),
			canonicalNumber(object.scale.y),
			canonicalNumber(object.scale.z),
		],
		castShadow: object.castShadow,
		receiveShadow: object.receiveShadow,
		renderOrder: object.renderOrder,
		...(renderable.geometry?.isBufferGeometry
			? { geometry: serializeResource(renderable.geometry) }
			: {}),
		...(Array.isArray(renderable.material)
			? { material: renderable.material.map(serializeResource) }
			: renderable.material?.isMaterial
				? { material: serializeResource(renderable.material) }
				: {}),
		...(canonicalUserData === undefined ? {} : { userData: canonicalUserData }),
		children: object.children.map(serializeThreeGraph),
	};
}
