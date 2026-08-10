import { Text3D, type Text3DProps } from '@octanejs/drei';
import type { FontData } from '@octanejs/drei';

const font = {} as FontData;
const props: Text3DProps = { font, smooth: 0.001, bevelEnabled: true, letterSpacing: 0.1 };
void props;
void Text3D;

// @ts-expect-error font is required
const missingFont: Text3DProps = {};
void missingFont;
