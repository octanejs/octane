import { useMemo } from 'octane';
import type { ReactNode } from 'react';
import mitt from 'mitt';
import EventEmitterContext from '../context/EventEmitterContext.tsrx';

/** Provider for EventEmitterContext. */
export default function EventEmitterProvider({ children }: { children: ReactNode }) {
	const emitter = useMemo(() => mitt(), []);
	return <EventEmitterContext.Provider value={emitter}>{children}</EventEmitterContext.Provider>;
}
