import * as THREE from 'three';
import { Select, type SelectProps, useSelect } from '../src/index.js';

const props: SelectProps = {
	children: null,
	multiple: true,
	box: true,
	filter: (selected) => selected.filter((object) => object.visible),
	onChange: (selected) => selected.forEach((object) => object.updateMatrix()),
};
const selected: THREE.Object3D[] = useSelect();
Select;
props;
selected;

// @ts-expect-error selection filters must return Three objects
const invalidFilter: SelectProps = { children: null, filter: () => ['mesh'] };
// @ts-expect-error multiple selection is boolean
const invalidMultiple: SelectProps = { children: null, multiple: 'yes' };
