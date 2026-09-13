import * as motion_dom from 'motion-dom';
import { MotionValue } from 'framer-motion/dom';

interface ThreeUniform<T = unknown> {
    value: T;
}
type ThreeUniforms<T extends object> = {
    [K in keyof T]: ThreeUniform<T[K]>;
};
type ThreeEffectValues = Record<string, MotionValue>;
type ThreeObject = Record<string, any>;
/**
 * Binds motion values to Three.js objects, materials and uniforms.
 *
 * Register with `animate.addEffect(threeEffect)` so `animate()` can target
 * meshes, lights, cameras, materials and uniforms directly, or call it
 * yourself to wire up existing motion values:
 *
 * ```ts
 * threeEffect(mesh, { x, rotateY, color })
 * threeEffect(uniforms, { progress })
 * ```
 *
 * Writes happen once per frame in `frame.preRender`, ahead of render loops
 * scheduled with `frame.render`.
 */
declare const threeEffect: motion_dom.AnimateEffect<ThreeObject>;

export { type ThreeEffectValues, type ThreeUniform, type ThreeUniforms, threeEffect };
