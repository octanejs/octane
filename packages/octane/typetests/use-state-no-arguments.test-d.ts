import { useState } from 'octane';
import { useState as useServerState } from 'octane/server';

// Without an initial value, state starts undefined: the client and server
// tuples admit `undefined` in their state, setter, and getter.
const [unset] = useState();
const unsetValue: undefined = unset;
const [serverUnset] = useServerState();
const serverUnsetValue: undefined = serverUnset;

const [label, setLabel, getLabel] = useState<string>();
const [serverLabel, setServerLabel, getServerLabel] = useServerState<string>();
setLabel(undefined);
setServerLabel(undefined);
const labels: (string | undefined)[] = [label, getLabel(), serverLabel, getServerLabel()];

// @ts-expect-error The client state type keeps `undefined` without an initial value.
const definiteLabel: string = label;
// @ts-expect-error The server state type keeps `undefined` without an initial value.
const definiteServerLabel: string = serverLabel;
