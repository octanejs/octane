import * as Grab from '@octanejs/grab';
import { expectTypeOf } from 'vitest';

Grab.init satisfies (options?: Grab.Options) => Grab.ReactGrabAPI;
Grab.getStack satisfies (element: Element) => Promise<unknown>;
Grab.formatElementInfo satisfies (element: Element) => Promise<string>;
Grab.isInstrumentationActive satisfies () => boolean;
Grab.commentPlugin satisfies Grab.Plugin;
Grab.openPlugin satisfies Grab.Plugin;
expectTypeOf(Grab.generateSnippet).returns.toEqualTypeOf<Promise<string[]>>();

// @ts-expect-error adapted init rejects a non-Options argument
Grab.init(42);
