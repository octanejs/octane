import { SoftShadows, type SoftShadowsProps } from '../src/index.js';

const props: SoftShadowsProps = { focus: 1, samples: 8, size: 20 };
SoftShadows;
props;

// @ts-expect-error samples is numeric
const invalidSamples: SoftShadowsProps = { samples: 'many' };
// @ts-expect-error focus is numeric
const invalidFocus: SoftShadowsProps = { focus: false };
