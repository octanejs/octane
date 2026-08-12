import type { PresentationControlProps } from '@octanejs/drei';

const props: PresentationControlProps = {
	rotation: [0, 0, 0],
	polar: [-1, 1],
	azimuth: [-2, 2],
	snap: 0.2,
	zoom: 0.8,
};
void props;

// @ts-expect-error rotation is a three-axis tuple
const invalid: PresentationControlProps = { rotation: [0, 1] };
void invalid;
