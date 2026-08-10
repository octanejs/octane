// Adapted side: the same assertion groups against @octanejs/drei with tsrx-tsc.
import { Box, Sphere, View, type ViewProps } from '@octanejs/drei';

const boxProps = { args: [1, 1, 1] as [number, number, number] };
const sphereProps = { args: [1, 16, 16] as [number, number, number] };
const viewProps: ViewProps = { index: 1, frames: 1 };
void [Box, Sphere, View, View.Port, boxProps, sphereProps, viewProps];

// @ts-expect-error frame count is numeric on View
const invalidView: ViewProps = { frames: 'always' };
void invalidView;
