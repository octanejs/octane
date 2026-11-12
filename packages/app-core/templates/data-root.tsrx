/**
 * The route's data store around its content. App-core renders it as each
 * route's outermost component when the config names a `data` module.
 *
 * A codegen template, not a module app code imports: the generated server and
 * client entries import it, so each app compiles it with its own toolchain and
 * its server markup and browser adoption line up as a layout's do.
 */
import type { OctaneNode } from 'octane';
import type { DataStore } from 'octane/data';
import { DataProvider } from 'octane/data/octane';

export function DataRoot(props: { store: DataStore; children?: OctaneNode }) @{
	<DataProvider store={props.store}>{props.children}</DataProvider>
}
