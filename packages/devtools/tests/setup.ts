import { afterAll, beforeAll } from 'vitest';
import { ClientEventBus } from '@tanstack/devtools-event-bus/client';

// The TanStack Devtools event-client delivers events over a window bus that is
// re-broadcast by a ClientEventBus (started by the devtools host in production).
// Tests run without the host, so we stand up the same bus here: it answers the
// client's connect handshake on `window` and re-broadcasts each dispatched event
// as its specific `${pluginId}:${suffix}` CustomEvent, which is what `client.on()`
// listens for. `connectToServerBus` defaults false, so no WebSocket is opened.
let bus: ClientEventBus;

beforeAll(() => {
	bus = new ClientEventBus();
	bus.start();
});

afterAll(() => {
	bus.stop();
});
