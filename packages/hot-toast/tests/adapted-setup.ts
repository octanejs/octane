import { vi } from 'vitest';

// The pinned suite drives Jest's timer API. Vitest's fake timers are the same
// @sinonjs clock, and Testing Library's waitFor advances them through the
// `jest` global when it sees one.
(globalThis as { jest?: typeof vi }).jest = vi;
