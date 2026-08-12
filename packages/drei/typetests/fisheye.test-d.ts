import { Fisheye, type FisheyeProps } from '@octanejs/drei';

const props: FisheyeProps = { children: null, zoom: 0.5, segments: 32, resolution: 256 };
void props;
void Fisheye;

// @ts-expect-error children are required
const missingChildren: FisheyeProps = {};
void missingChildren;
