import {
	Backdrop,
	BBAnchor,
	Billboard,
	Float,
	type BackdropProps,
	type BBAnchorProps,
	type BillboardProps,
	type FloatProps,
} from '../src/index.js';
import { Vector3 } from 'three';

const backdrop: BackdropProps = { floor: 0.4, segments: 8 };
const anchorTuple: BBAnchorProps = { anchor: [1, 0, -1] };
const anchorVector: BBAnchorProps = { anchor: new Vector3() };
const billboard: BillboardProps = { follow: true, lockX: false };
const floating: FloatProps = { speed: 2, floatingRange: [-1, 1] };
Backdrop;
BBAnchor;
Billboard;
Float;
backdrop;
anchorTuple;
anchorVector;
billboard;
floating;

// @ts-expect-error anchors require three numeric axes
const invalidAnchor: BBAnchorProps = { anchor: [1, 2] };
// @ts-expect-error speed is numeric
const invalidFloat: FloatProps = { speed: 'fast' };
