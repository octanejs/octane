/**
 * @import {
 *   Tickable,
 *   ScopeParams,
 *   DOMTarget,
 *   ReactRef,
 *   AngularRef,
 *   DOMTargetSelector,
 *   DefaultsParams,
 *   ScopeConstructorCallback,
 *   ScopeCleanupCallback,
 *   Revertible,
 *   ScopeMethod,
 *   ScopedCallback,
 * } from '../types/index.js'
*/
export class Scope {
    /** @param {ScopeParams} [parameters] */
    constructor(parameters?: ScopeParams);
    /** @type {DefaultsParams} */
    defaults: DefaultsParams;
    /** @type {Document|DOMTarget} */
    root: Document | DOMTarget;
    /** @type {Array<ScopeConstructorCallback>} */
    constructors: Array<ScopeConstructorCallback>;
    /** @type {Array<ScopeCleanupCallback>} */
    revertConstructors: Array<ScopeCleanupCallback>;
    /** @type {Array<Revertible>} */
    revertibles: Array<Revertible>;
    /** @type {Array<ScopeConstructorCallback | ((scope: this) => Tickable)>} */
    constructorsOnce: Array<ScopeConstructorCallback | ((scope: this) => Tickable)>;
    /** @type {Array<ScopeCleanupCallback>} */
    revertConstructorsOnce: Array<ScopeCleanupCallback>;
    /** @type {Array<Revertible>} */
    revertiblesOnce: Array<Revertible>;
    /** @type {Boolean} */
    once: boolean;
    /** @type {Number} */
    onceIndex: number;
    /** @type {Record<String, ScopeMethod>} */
    methods: Record<string, ScopeMethod>;
    /** @type {Record<String, Boolean>} */
    matches: Record<string, boolean>;
    /** @type {Record<String, MediaQueryList>} */
    mediaQueryLists: Record<string, MediaQueryList>;
    /** @type {Record<String, any>} */
    data: Record<string, any>;
    /**
     * @param {Revertible} revertible
     */
    register(revertible: Revertible): void;
    /**
     * @template T
     * @param {ScopedCallback<T>} cb
     * @return {T}
     */
    execute<T>(cb: ScopedCallback<T>): T;
    /**
     * @return {this}
     */
    refresh(): this;
    /**
     * @overload
     * @param {String} a1
     * @param {ScopeMethod} a2
     * @return {this}
     *
     * @overload
     * @param {ScopeConstructorCallback} a1
     * @return {this}
     *
     * @param {String|ScopeConstructorCallback} a1
     * @param {ScopeMethod} [a2]
     */
    add(a1: string, a2: ScopeMethod): this;
    /**
     * @overload
     * @param {String} a1
     * @param {ScopeMethod} a2
     * @return {this}
     *
     * @overload
     * @param {ScopeConstructorCallback} a1
     * @return {this}
     *
     * @param {String|ScopeConstructorCallback} a1
     * @param {ScopeMethod} [a2]
     */
    add(a1: ScopeConstructorCallback): this;
    /**
     * @param {ScopeConstructorCallback} scopeConstructorCallback
     * @return {this}
     */
    addOnce(scopeConstructorCallback: ScopeConstructorCallback): this;
    /**
     * @param  {(scope: this) => Tickable} cb
     * @return {Tickable}
     */
    keepTime(cb: (scope: this) => Tickable): Tickable;
    /**
     * @param {Event} e
     */
    handleEvent(e: Event): void;
    revert(): void;
}
export function createScope(params?: ScopeParams): Scope;
import type { DefaultsParams } from '../types/index.js';
import type { DOMTarget } from '../types/index.js';
import type { ScopeConstructorCallback } from '../types/index.js';
import type { ScopeCleanupCallback } from '../types/index.js';
import type { Revertible } from '../types/index.js';
import type { Tickable } from '../types/index.js';
import type { ScopeMethod } from '../types/index.js';
import type { ScopedCallback } from '../types/index.js';
import type { ScopeParams } from '../types/index.js';
