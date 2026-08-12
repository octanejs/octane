import * as THREE from 'three';
import { CurveModifier, type CurveModifierProps, type CurveModifierRef } from '../src/index.js';

const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
const props: CurveModifierProps = { children: null, curve };
declare const flow: CurveModifierRef;
flow.moveAlongCurve(0.1);
CurveModifier;
props;

// @ts-expect-error curve must produce Vector3 points
const invalidCurve: CurveModifierProps = { children: null, curve: new THREE.EllipseCurve() };
