import { Stars, type StarsProps } from '../src/index.js';

const props: StarsProps = { radius: 80, depth: 20, count: 1000, factor: 3, fade: true, speed: 0.5 };
Stars;
props;

// @ts-expect-error star count is numeric
const invalidCount: StarsProps = { count: 'many' };
// @ts-expect-error fade is boolean
const invalidFade: StarsProps = { fade: 1 };
