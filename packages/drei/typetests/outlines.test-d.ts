import { Outlines, type OutlinesProps } from '@octanejs/drei';

const props: OutlinesProps = { color: 'black', thickness: 0.05, screenspace: true, angle: Math.PI };
void props;
void Outlines;

// @ts-expect-error thickness is numeric
const invalid: OutlinesProps = { thickness: 'wide' };
void invalid;
