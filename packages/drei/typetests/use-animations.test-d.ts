import { useAnimations } from '../src/index.js';
import { AnimationClip, Object3D } from 'three';

const root = new Object3D();
const clips = [new AnimationClip('walk')];
const api = useAnimations(clips, root);
api.actions.walk?.play();
api.mixer.update(0.1);
api.ref.current?.updateMatrixWorld();

// @ts-expect-error clips must be Three animation clips
useAnimations([{}], root);
// @ts-expect-error root must be an Object3D or compatible ref
useAnimations(clips, {});
