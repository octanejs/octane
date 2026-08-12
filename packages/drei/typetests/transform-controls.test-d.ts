import { TransformControls, type TransformControlsProps } from '../src/index.js';

const props: TransformControlsProps = { mode: 'translate', space: 'local', showX: false };
TransformControls;
props;

// @ts-expect-error mode is constrained
const invalidMode: TransformControlsProps = { mode: 'skew' };
// @ts-expect-error size is numeric
const invalidSize: TransformControlsProps = { size: 'large' };
