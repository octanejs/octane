import type { CubeTexture as ThreeCubeTexture, Texture as ThreeTexture } from 'three';
import {
	CubeTexture,
	type CubeTextureOptions,
	type CubeTextureProps,
	Ktx2,
	type MappedTextureType,
	Texture,
	useCubeTexture,
	useKTX2,
	useTexture,
} from '../src/index.js';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type _single = Expect<Equal<MappedTextureType<string>, ThreeTexture>>;
type _array = Expect<Equal<MappedTextureType<string[]>, ThreeTexture[]>>;
type _record = Expect<
	Equal<
		MappedTextureType<{ map: string; normal: string }>,
		{ map: ThreeTexture; normal: ThreeTexture }
	>
>;

const single = useTexture('/texture.png');
const array = useTexture(['/a.png', '/b.png']);
const record = useTexture({ map: '/map.png', normal: '/normal.png' });
const _singleResult: ThreeTexture = single;
const _arrayResult: ThreeTexture[] = array;
const _recordResult: ThreeTexture = record.map;

const textureProps: Parameters<typeof Texture>[0] = {
	input: { map: '/map.png' },
	children: (texture) => (texture ? null : null),
};
const cubeOptions: CubeTextureOptions = { path: '/cube/' };
const cubeProps: CubeTextureProps = {
	...cubeOptions,
	files: ['px', 'nx', 'py', 'ny', 'pz', 'nz'],
	children: (texture) => (texture ? null : null),
};
const cube: ThreeCubeTexture = useCubeTexture(cubeProps.files, cubeOptions);
const cubeComponentProps: Parameters<typeof CubeTexture>[0] = cubeProps;
const ktxSingle: ThreeTexture = useKTX2('/texture.ktx2');
const ktxArray: ThreeTexture[] = useKTX2(['/a.ktx2', '/b.ktx2']);
const ktxRecord: ThreeTexture = useKTX2({ map: '/map.ktx2' }).map;
const ktxProps: Parameters<typeof Ktx2>[0] = {
	input: '/texture.ktx2',
	basisPath: '/basis/',
	children: (texture) => (texture ? null : null),
};

void [
	_singleResult,
	_arrayResult,
	_recordResult,
	textureProps,
	cube,
	cubeComponentProps,
	ktxSingle,
	ktxArray,
	ktxRecord,
	ktxProps,
];

// @ts-expect-error Texture inputs are URLs, URL arrays, or URL records.
useTexture(42);
// @ts-expect-error CubeTexture requires a path option.
useCubeTexture(['px'], {});
