import { FaceLandmarkerDefaults, type FaceLandmarkerProps } from '@octanejs/drei';

const props: FaceLandmarkerProps = { basePath: '/wasm', options: FaceLandmarkerDefaults.options };
FaceLandmarkerDefaults.basePath.toUpperCase();
void props;

// @ts-expect-error basePath is a URL/path string
const invalid: FaceLandmarkerProps = { basePath: 17 };
void invalid;
