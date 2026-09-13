import * as motion_dom from 'motion-dom';
import { MotionValue } from 'framer-motion/dom';

type VGPUEffectValues = Record<string, MotionValue>;
type Subject = Record<string, any>;
/**
 * Binds motion values to vgpu shared uniforms, Effect/Draw/Compute bindings
 * ("params.time"), scene nodes (x, rotateY, scale), cameras, lights,
 * materials, orbit controls and target clear colors.
 *
 * Register with `animate.addEffect(vgpuEffect)` so `animate()` can target
 * these subjects directly, or call it yourself to wire up existing motion
 * values:
 *
 * ```ts
 * vgpuEffect(wave, { "params.time": time })
 * vgpuEffect(cube, { x, rotateY })
 * ```
 *
 * Changed values are batched into a single set() per subject per frame in
 * `frame.preRender`, ahead of render loops scheduled with `frame.render`.
 */
declare const vgpuEffect: motion_dom.AnimateEffect<Subject>;

export { type VGPUEffectValues, vgpuEffect };
