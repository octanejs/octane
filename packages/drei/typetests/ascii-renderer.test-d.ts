import { AsciiRenderer, type AsciiRendererProps } from '../src/index.js';

const props: AsciiRendererProps = { characters: 'xo', invert: false, resolution: 0.25 };
AsciiRenderer;
props;

// @ts-expect-error resolution is numeric
const invalidResolution: AsciiRendererProps = { resolution: 'fine' };
// @ts-expect-error invert is boolean
const invalidInvert: AsciiRendererProps = { invert: 1 };
