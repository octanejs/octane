import * as ReactGrab from 'react-grab';
import { expectTypeOf } from 'vitest';

ReactGrab.init satisfies (options?: ReactGrab.Options) => ReactGrab.ReactGrabAPI;
ReactGrab.getStack satisfies (element: Element) => Promise<unknown>;
ReactGrab.formatElementInfo satisfies (element: Element) => Promise<string>;
ReactGrab.isInstrumentationActive satisfies () => boolean;
ReactGrab.commentPlugin satisfies ReactGrab.Plugin;
ReactGrab.openPlugin satisfies ReactGrab.Plugin;
expectTypeOf(ReactGrab.generateSnippet).returns.toEqualTypeOf<Promise<string[]>>();

// @ts-expect-error upstream init rejects a non-Options argument
ReactGrab.init(42);
