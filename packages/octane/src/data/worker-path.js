/**
 * Where the build plugins emit an app's data worker. The path never changes
 * between deploys, so every tab constructs the same SharedWorker and shares
 * its owner. Plain JavaScript, so the plugins and the data runtime import one
 * value.
 */
export const DATA_WORKER_PATH = '/_octane/data-worker.js';
