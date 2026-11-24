// `octane/data/client` resolves to this file, and this loader replaces it with
// the module generated from the `dataClient` option's module.
import { dataClientModule } from 'octane/compiler/bundler';

export default function dataClientLoader() {
	return dataClientModule(this.getOptions().file);
}
