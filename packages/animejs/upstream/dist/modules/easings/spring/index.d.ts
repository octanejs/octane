export class Spring {
    /**
     * @param {SpringParams} [parameters]
     */
    constructor(parameters?: SpringParams);
    timeStep: number;
    restThreshold: number;
    restDuration: number;
    maxDuration: number;
    maxRestSteps: number;
    maxIterations: number;
    bn: number;
    pd: number;
    m: number;
    s: number;
    d: number;
    v: number;
    w0: number;
    zeta: number;
    wd: number;
    b: number;
    completed: boolean;
    solverDuration: number;
    settlingDuration: number;
    /** @type {JSAnimation} */
    parent: JSAnimation;
    /** @type {Callback<JSAnimation>} */
    onComplete: Callback<JSAnimation>;
    /** @type {EasingFunction} */
    ease: EasingFunction;
    solve(time: number): number;
    calculateSDFromBD(): void;
    calculateBDFromSD(): void;
    compute(): void;
    set bounce(v: number);
    get bounce(): number;
    set duration(v: number);
    get duration(): number;
    set stiffness(v: number);
    get stiffness(): number;
    set damping(v: number);
    get damping(): number;
    set mass(v: number);
    get mass(): number;
    set velocity(v: number);
    get velocity(): number;
}
export function spring(parameters?: SpringParams): Spring;
export function createSpring(parameters?: SpringParams): Spring;
import type { JSAnimation } from '../../animation/animation.js';
import type { Callback } from '../../types/index.js';
import type { EasingFunction } from '../../types/index.js';
import type { SpringParams } from '../../types/index.js';
