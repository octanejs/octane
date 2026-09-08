/*
 * We distinguish between internal and exported edges
 * The internal edges are used directly like custom edges and always get an id, source and target props
 * If you import an edge from the library, the id is optional and source and target are not used at all
 */

export { SimpleBezierEdge, SimpleBezierEdgeInternal } from './SimpleBezierEdge.tsrx';
export { SmoothStepEdge, SmoothStepEdgeInternal } from './SmoothStepEdge.tsrx';
export { StepEdge, StepEdgeInternal } from './StepEdge.tsrx';
export { StraightEdge, StraightEdgeInternal } from './StraightEdge.tsrx';
export { BezierEdge, BezierEdgeInternal } from './BezierEdge.tsrx';
