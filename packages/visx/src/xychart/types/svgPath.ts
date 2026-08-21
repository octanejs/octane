import type { ComponentBody } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

/** Host `path` or an Octane component that accepts path SVG props. */
export type SvgPathComponent = 'path' | ComponentBody<Omit<Octane.SVGProps<SVGPathElement>, 'ref'>>;
