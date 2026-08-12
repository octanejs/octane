import type { MeshRefractionMaterialProps } from '@octanejs/drei';
import { CubeTexture } from 'three';

const props: MeshRefractionMaterialProps = {
	envMap: new CubeTexture(),
	bounces: 3,
	ior: 2.4,
	fastChroma: true,
	color: 'white',
};
void props;

// @ts-expect-error an environment texture is required
const missingEnvironment: MeshRefractionMaterialProps = { ior: 1.5 };
void missingEnvironment;
