import type { MeshTransmissionMaterialProps } from '@octanejs/drei';

const props: MeshTransmissionMaterialProps = {
	samples: 8,
	backside: true,
	resolution: 256,
	chromaticAberration: 0.1,
};
void props;

// @ts-expect-error samples must be numeric
const invalid: MeshTransmissionMaterialProps = { samples: '8' };
void invalid;
