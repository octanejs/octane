import { Camera, Icon, createLucideIcon, type LucideIconData, type LucideIconNode } from '../src';

const child: LucideIconNode = ['path', { d: 'M0 0L1 1' }];
const data: LucideIconData = { name: 'wide', width: 48, height: 16, node: [['g', {}, [child]]] };
const Custom = createLucideIcon(data);
Custom({ nonScalingStroke: true, width: 96, height: 32, ref: { current: null } });
createLucideIcon('custom', [child], ['alias'])({ size: 16 });
Icon({ icon: data });
Icon({ iconNode: [child] });
Camera({ nonScalingStroke: true });

// @ts-expect-error A custom view box uses a size or dimensions, never both.
const conflictingDimensions: LucideIconData = { size: 24, width: 48, node: [] };
// @ts-expect-error Child icon nodes must be well-formed tuples.
createLucideIcon({ node: ['path'] });
// @ts-expect-error Both icon representations cannot be supplied together.
Icon({ icon: data, iconNode: [child] });
// @ts-expect-error Stroke scaling takes a boolean.
Camera({ nonScalingStroke: 'true' });
// @ts-expect-error An SVG icon cannot receive an HTML element ref.
Custom({ ref: { current: document.createElement('div') } });
