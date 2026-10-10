// Test adapter only: reuse the compiler suite's recorder, not a native renderer.
const { createWriterRecorder } = require('../../../recorder.cjs');
const recorder = createWriterRecorder();
Object.assign(exports, recorder.adapter);
exports.render = recorder.render;
