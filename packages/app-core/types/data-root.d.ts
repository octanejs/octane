import type { OctaneNode } from 'octane';
import type { DataStore } from 'octane/data';

/** The route's data store around its content; app-core renders it for the config's `data` module. */
export function DataRoot(props: { store: DataStore; children?: OctaneNode }): OctaneNode;
