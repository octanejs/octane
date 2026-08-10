import type { MeshReflectorMaterialProps } from '@octanejs/drei';

const props: MeshReflectorMaterialProps = {
	resolution: 512,
	blur: [2, 4],
	mirror: 0.5,
	mixStrength: 1.5,
	depthScale: 0.2,
};
void props;

// @ts-expect-error blur accepts a scalar or a two-axis tuple
const invalid: MeshReflectorMaterialProps = { blur: [1, 2, 3] };
void invalid;
