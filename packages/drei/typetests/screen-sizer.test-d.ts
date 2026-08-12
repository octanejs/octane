import { ScreenSizer, type ScreenSizerProps } from '../src/index.js';

const props: ScreenSizerProps = { scale: 2, position: [1, 2, 3], name: 'sizer' };
ScreenSizer;
props;

// @ts-expect-error scale is numeric
const invalidScale: ScreenSizerProps = { scale: 'large' };
// @ts-expect-error position must be a Three-compatible vector representation
const invalidPosition: ScreenSizerProps = { position: [1, 2] };
