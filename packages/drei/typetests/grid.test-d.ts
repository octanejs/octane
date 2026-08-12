import { Grid, type GridMaterialType, type GridProps } from '../src/index.js';
import { DoubleSide } from 'three';

const material: GridMaterialType = {
	cellSize: 0.5,
	cellColor: '#123456',
	followCamera: true,
	side: DoubleSide,
};
const props: GridProps = { ...material, args: [2, 3, 4, 5], name: 'grid' };
Grid;
props;

// @ts-expect-error cell size is numeric
const invalidSize: GridProps = { cellSize: 'small' };
// @ts-expect-error followCamera is boolean
const invalidFollow: GridMaterialType = { followCamera: 1 };
