import { AdaptiveDpr, AdaptiveEvents, BakeShadows, useAspect } from '../src/index.js';

const aspect: [number, number, number] = useAspect(16, 9);
const scaled: [number, number, number] = useAspect(4, 3, 2);
const dprProps: Parameters<typeof AdaptiveDpr>[0] = { pixelated: true };
const eventsComponent: () => unknown = AdaptiveEvents;
const shadowsComponent: () => unknown = BakeShadows;
void [aspect, scaled, dprProps, eventsComponent, shadowsComponent];

// @ts-expect-error Pixelation is a boolean flag.
const invalid: Parameters<typeof AdaptiveDpr>[0] = { pixelated: 'yes' };
void invalid;
