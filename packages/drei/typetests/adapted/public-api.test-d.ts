// Adapted side: the same assertion groups against @octanejs/drei with tsrx-tsc.
import { Box, Sphere, View, type ViewProps } from '@octanejs/drei';

// Assertion group 1: public exports and accepted prop shapes.
const boxProps = { args: [1, 1, 1] as [number, number, number] };
const sphereProps = { args: [1, 16, 16] as [number, number, number] };
const viewProps: ViewProps = { index: 1, frames: 1 };
void [Box, Sphere, View, View.Port, boxProps, sphereProps, viewProps];

// Assertion group 2: invalid View frame count is rejected.
// @ts-expect-error frame count is numeric on View
const invalidView: ViewProps = { frames: 'always' };
void invalidView;
