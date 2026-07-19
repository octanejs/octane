import { useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import mitt from 'mitt';
import EventEmitterContext from '../context/EventEmitterContext.tsrx';

/** Provider for EventEmitterContext. */
export default function EventEmitterProvider({ children }: { children: OctaneNode }) {
	const emitter = useMemo(() => mitt(), []);
	return <EventEmitterContext.Provider value={emitter}>{children}</EventEmitterContext.Provider>;
}
