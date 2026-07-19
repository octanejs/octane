import type { D3Scale, PickD3Scale } from '@octanejs/visx/scale';
import type { Octane } from 'octane/jsx-runtime';
import type { OctaneNode } from 'octane';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type $TSFIXME = any;

export type DatumObject = Record<string | number, $TSFIXME>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyScaleBand = PickD3Scale<'band', any, any>;

/** A catch-all type for scales that returns number */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PositionScale = D3Scale<number, any, any>;

/**
 * Add fields from octane's `SVGProps` (native event handlers — Octane
 * delivers native, delegated DOM events, not React synthetics) for the
 * specified SVG `Element` to `Props` except fields that already exist
 * in `Props`
 */
export type AddSVGProps<Props, Element extends SVGElement> = Props &
	Omit<Octane.SVGProps<Element>, keyof Props>;

export type RenderProp<Input> = (args: Input) => OctaneNode;
