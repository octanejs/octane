import { Resize, type ResizeProps } from '../src/index.js';
import { Box3 } from 'three';

const props: ResizeProps = { width: true, box3: new Box3(), precise: false, name: 'fit' };
Resize;
props;

// @ts-expect-error axis selectors are boolean
const invalidAxis: ResizeProps = { height: 'yes' };
// @ts-expect-error box3 must be a Three Box3
const invalidBox: ResizeProps = { box3: {} };
