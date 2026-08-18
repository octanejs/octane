// Pristine side: pinned @react-three/drei@10.7.7 typings, compiled with tsc.
import { Box, Sphere, View, type ViewProps } from '@react-three/drei';

// Assertion group 1: public exports and accepted prop shapes.
const boxProps = { args: [1, 1, 1] as [number, number, number] };
const sphereProps = { args: [1, 16, 16] as [number, number, number] };
const viewProps: ViewProps = { index: 1, frames: 1 };
void [Box, Sphere, View, View.Port, boxProps, sphereProps, viewProps];

// Assertion group 2: invalid View frame count is rejected.
// @ts-expect-error frame count is numeric on View
const invalidView: ViewProps = { frames: 'always' };
void invalidView;
