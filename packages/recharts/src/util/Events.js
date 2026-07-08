// Vendored verbatim from recharts@3.9.2 es6/util/Events.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import EventEmitter from 'eventemitter3';
var eventCenter = new EventEmitter();
export { eventCenter };
export var TOOLTIP_SYNC_EVENT = 'recharts.syncEvent.tooltip';
export var BRUSH_SYNC_EVENT = 'recharts.syncEvent.brush';