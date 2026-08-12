import {
	CatmullRomLine,
	CubicBezierLine,
	Edges,
	Line,
	QuadraticBezierLine,
	type CatmullRomLineProps,
	type CubicBezierLineProps,
	type EdgesProps,
	type EdgesRef,
	type LineProps,
	type QuadraticBezierLineProps,
	type QuadraticBezierLineRef,
} from '../src/index.js';
import { Vector2, Vector3 } from 'three';

const line: LineProps = { points: [[0, 0], new Vector2(1, 2), new Vector3(2, 3, 4)] };
const quadratic: QuadraticBezierLineProps = { start: [0, 0, 0], end: [1, 1, 0], segments: 12 };
const cubic: CubicBezierLineProps = {
	start: [0, 0, 0],
	end: [1, 1, 1],
	midA: [0, 1, 0],
	midB: [1, 0, 1],
};
const catmull: CatmullRomLineProps = {
	points: [
		[0, 0, 0],
		[1, 1, 0],
	],
	curveType: 'chordal',
};
const edges: EdgesProps = { threshold: 20, lineWidth: 2 };
let edgeRef!: EdgesRef;
let quadraticRef!: QuadraticBezierLineRef;
quadraticRef.setPoints([0, 0, 0], [1, 1, 0], [0.5, 1, 0]);
Line;
QuadraticBezierLine;
CubicBezierLine;
CatmullRomLine;
Edges;
line;
quadratic;
cubic;
catmull;
edges;
edgeRef;

// @ts-expect-error lines require 2D or 3D points
const invalidLine: LineProps = { points: [[0]] };
// @ts-expect-error curve type is constrained by Three.js
const invalidCatmull: CatmullRomLineProps = { points: [[0, 0, 0]], curveType: 'linear' };
