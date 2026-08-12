import {
	ArcballControls,
	DeviceOrientationControls,
	FirstPersonControls,
	FlyControls,
	MapControls,
	OrbitControls,
	TrackballControls,
	type ArcballControlsProps,
	type DeviceOrientationControlsProps,
	type FirstPersonControlsProps,
	type FlyControlsProps,
	type MapControlsProps,
	type OrbitControlsChangeEvent,
	type OrbitControlsProps,
	type TrackballControlsProps,
} from '../src/index.js';

const orbit: OrbitControlsProps = { enableDamping: true, keyEvents: false, target: [0, 1, 0] };
const map: MapControlsProps = { makeDefault: true, maxDistance: 100 };
const trackball: TrackballControlsProps = { regress: true, rotateSpeed: 2 };
const arcball: ArcballControlsProps = { enableAnimations: true };
const fly: FlyControlsProps = { movementSpeed: 3, rollSpeed: 0.5 };
const first: FirstPersonControlsProps = { lookSpeed: 0.1 };
const device: DeviceOrientationControlsProps = { makeDefault: false };
let event!: OrbitControlsChangeEvent;
event.type;
OrbitControls;
MapControls;
TrackballControls;
ArcballControls;
FlyControls;
FirstPersonControls;
DeviceOrientationControls;
orbit;
map;
trackball;
arcball;
fly;
first;
device;

// @ts-expect-error damping is boolean
const invalidOrbit: OrbitControlsProps = { enableDamping: 'yes' };
// @ts-expect-error movement speed is numeric
const invalidFly: FlyControlsProps = { movementSpeed: 'fast' };
