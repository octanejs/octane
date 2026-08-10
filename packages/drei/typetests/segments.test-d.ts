import * as THREE from 'three';
import {
	Segment,
	SegmentObject,
	type SegmentProps,
	Segments,
	type SegmentsProps,
} from '../src/index.js';

const segment: SegmentProps = { start: 0, end: [1, 2, 3], color: '#fff' };
const segments: SegmentsProps = { children: null, limit: 10, lineWidth: 2, dashed: true };
const object: SegmentObject = new SegmentObject();
object.start = new THREE.Vector3();
Segment;
Segments;
segment;
segments;

// @ts-expect-error segment endpoints must be vector-like
const invalidStart: SegmentProps = { start: 'origin', end: [1, 2, 3] };
// @ts-expect-error segment limits are numeric
const invalidLimit: SegmentsProps = { children: null, limit: 'ten' };
