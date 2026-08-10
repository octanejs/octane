import { Helper, type HelperProps, useHelper } from '../src/index.js';
import type { RefObject } from '@octanejs/three';
import { BoxHelper, Mesh } from 'three';

const target: RefObject<Mesh> = { current: new Mesh() };
const helper = useHelper(target, BoxHelper, 0xff0000);
const props: HelperProps<typeof BoxHelper> = { type: BoxHelper, args: [0x00ff00] };
Helper;
helper.current?.update?.();
props;

// @ts-expect-error BoxHelper accepts at most one helper argument after the target
const invalidArgs: HelperProps<typeof BoxHelper> = { type: BoxHelper, args: [0xff0000, 2] };
// @ts-expect-error helper target must be an Object3D ref or falsey
useHelper({ current: {} }, BoxHelper);
