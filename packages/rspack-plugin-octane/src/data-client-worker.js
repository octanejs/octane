// The data worker's entry when the app has a `dataClient`: this loader replaces
// the file with a worker that serves the client's owner.
import { dataClientWorker } from 'octane/compiler/bundler';

export default function dataClientWorkerLoader() {
	return dataClientWorker(this.getOptions().file);
}
