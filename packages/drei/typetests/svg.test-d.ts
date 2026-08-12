import { Svg, type SvgProps } from '@octanejs/drei';

const props: SvgProps = { src: '<svg/>', skipFill: true, fillMaterial: { opacity: 0.5 } };
void props;
void Svg;

// @ts-expect-error src is required
const missingSource: SvgProps = {};
void missingSource;
