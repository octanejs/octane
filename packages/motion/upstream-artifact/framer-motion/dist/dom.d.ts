import { AnyResolvedKeyframe, UnresolvedValueKeyframe, AnimationOptions, MotionValue, Transition, ElementOrSelector, DOMKeyframesDefinition, AnimationPlaybackOptions, AnimationPlaybackControlsWithThen, ValueAnimationTransition, addEffect, removeEffect, AnimationScope, AnimationPlaybackControls } from 'motion-dom';
export * from 'motion-dom';
export { DelayedFunction, delayInSeconds as delay } from 'motion-dom';
import { Easing, EasingFunction, Point } from 'motion-utils';
export * from 'motion-utils';

/**
 * Lifecycle callbacks are not supported on individual sequence segments
 * because segments are consolidated into a single animation per subject.
 * Use sequence-level options (e.g. SequenceOptions.onComplete) instead.
 */
type LifecycleCallbacks = "onUpdate" | "onPlay" | "onComplete" | "onRepeat" | "onStop";
/**
 * Distributive Omit preserves union branches (unlike plain Omit).
 */
type DistributiveOmit<T, K extends string> = T extends any ? Omit<T, K> : never;
type SegmentTransitionOptions = DistributiveOmit<AnimationOptions, LifecycleCallbacks> & At;
type SegmentValueTransitionOptions = DistributiveOmit<Transition, LifecycleCallbacks> & At;
/**
 * Known keys of the object are suggested, but any key is accepted so
 * effects registered via `animate.addEffect()` can expose shorthands like
 * `rotateY` or `"params.time"` on subjects that don't have those properties.
 */
type ObjectTarget<O> = {
    [K in keyof O]?: O[K] | UnresolvedValueKeyframe | UnresolvedValueKeyframe[];
} & {
    [key: string]: unknown;
};
type SequenceTime = number | "<" | `+${number}` | `-${number}` | `${string}`;
type SequenceLabel = string;
interface SequenceLabelWithTime {
    name: SequenceLabel;
    at: SequenceTime;
}
interface At {
    at?: SequenceTime;
}
type MotionValueSegment = [
    MotionValue,
    UnresolvedValueKeyframe | UnresolvedValueKeyframe[]
];
type MotionValueSegmentWithTransition = [
    MotionValue,
    UnresolvedValueKeyframe | UnresolvedValueKeyframe[],
    SegmentValueTransitionOptions
];
type DOMSegment = [ElementOrSelector, DOMKeyframesDefinition];
type DOMSegmentWithTransition = [
    ElementOrSelector,
    DOMKeyframesDefinition,
    SegmentTransitionOptions
];
type ObjectSegment<O extends {} = {}> = [O, ObjectTarget<O>];
type ObjectSegmentWithTransition<O extends {} = {}> = [
    O,
    ObjectTarget<O>,
    SegmentTransitionOptions
];
type SequenceProgressCallback = (value: any) => void;
type FunctionSegment = [SequenceProgressCallback] | [SequenceProgressCallback, SegmentTransitionOptions] | [
    SequenceProgressCallback,
    UnresolvedValueKeyframe | UnresolvedValueKeyframe[],
    SegmentTransitionOptions
];
type Segment = ObjectSegment | ObjectSegmentWithTransition | SequenceLabel | SequenceLabelWithTime | MotionValueSegment | MotionValueSegmentWithTransition | DOMSegment | DOMSegmentWithTransition | FunctionSegment;
type AnimationSequence = Segment[];
interface SequenceOptions extends AnimationPlaybackOptions {
    delay?: number;
    duration?: number;
    defaultTransition?: Transition;
    reduceMotion?: boolean;
    skipAnimations?: boolean;
    onComplete?: () => void;
}
interface AbsoluteKeyframe {
    value: AnyResolvedKeyframe | null;
    at: number;
    easing?: Easing;
}
type ValueSequence = AbsoluteKeyframe[];
interface SequenceMap {
    [key: string]: ValueSequence;
}
type ResolvedAnimationDefinition = {
    keyframes: {
        [key: string]: UnresolvedValueKeyframe[];
    };
    transition: {
        [key: string]: Transition;
    };
};
type ResolvedAnimationDefinitions = Map<Element | MotionValue, ResolvedAnimationDefinition>;

interface ScopedAnimateOptions {
    scope?: AnimationScope;
    reduceMotion?: boolean;
    skipAnimations?: boolean;
}
/**
 * Creates an animation function that is optionally scoped
 * to a specific element.
 */
declare function createScopedAnimate(options?: ScopedAnimateOptions): {
    (sequence: AnimationSequence, options?: SequenceOptions): AnimationPlaybackControlsWithThen;
    (value: string | MotionValue<string>, keyframes: string | UnresolvedValueKeyframe<string>[], options?: ValueAnimationTransition<string>): AnimationPlaybackControlsWithThen;
    (value: number | MotionValue<number>, keyframes: number | UnresolvedValueKeyframe<number>[], options?: ValueAnimationTransition<number>): AnimationPlaybackControlsWithThen;
    <V extends string | number>(value: V | MotionValue<V>, keyframes: V | UnresolvedValueKeyframe<V>[], options?: ValueAnimationTransition<V>): AnimationPlaybackControlsWithThen;
    (element: ElementOrSelector, keyframes: DOMKeyframesDefinition, options?: AnimationOptions): AnimationPlaybackControlsWithThen;
    <O extends {}>(object: O | O[], keyframes: ObjectTarget<O>, options?: AnimationOptions): AnimationPlaybackControlsWithThen;
};
declare const animate: {
    (sequence: AnimationSequence, options?: SequenceOptions): AnimationPlaybackControlsWithThen;
    (value: string | MotionValue<string>, keyframes: string | UnresolvedValueKeyframe<string>[], options?: ValueAnimationTransition<string>): AnimationPlaybackControlsWithThen;
    (value: number | MotionValue<number>, keyframes: number | UnresolvedValueKeyframe<number>[], options?: ValueAnimationTransition<number>): AnimationPlaybackControlsWithThen;
    <V extends string | number>(value: V | MotionValue<V>, keyframes: V | UnresolvedValueKeyframe<V>[], options?: ValueAnimationTransition<V>): AnimationPlaybackControlsWithThen;
    (element: ElementOrSelector, keyframes: DOMKeyframesDefinition, options?: AnimationOptions): AnimationPlaybackControlsWithThen;
    <O extends {}>(object: O | O[], keyframes: ObjectTarget<O>, options?: AnimationOptions): AnimationPlaybackControlsWithThen;
} & {
    /**
     * Register an effect so `animate()` can animate the subjects it
     * claims, for instance `animate.addEffect(threeEffect)`. The most
     * recently added effect is tested first. DOM elements are always
     * animated directly.
     */
    addEffect: typeof addEffect;
    removeEffect: typeof removeEffect;
};

declare const animateMini: (elementOrSelector: ElementOrSelector, keyframes: DOMKeyframesDefinition, options?: AnimationOptions) => AnimationPlaybackControlsWithThen;

interface ScrollOptions {
    source?: HTMLElement;
    container?: Element;
    target?: Element;
    axis?: "x" | "y";
    offset?: ScrollOffset;
}
type OnScrollProgress = (progress: number) => void;
type OnScrollWithInfo = (progress: number, info: ScrollInfo) => void;
type OnScroll = OnScrollProgress | OnScrollWithInfo;
interface AxisScrollInfo {
    current: number;
    offset: number[];
    progress: number;
    scrollLength: number;
    velocity: number;
    targetOffset: number;
    targetLength: number;
    containerLength: number;
    interpolatorOffsets?: number[];
    interpolate?: EasingFunction;
}
interface ScrollInfo {
    time: number;
    x: AxisScrollInfo;
    y: AxisScrollInfo;
}
type OnScrollInfo = (info: ScrollInfo) => void;
type SupportedEdgeUnit = "px" | "vw" | "vh" | "%";
type EdgeUnit = `${number}${SupportedEdgeUnit}`;
type NamedEdges = "start" | "end" | "center";
type EdgeString = NamedEdges | EdgeUnit | `${number}`;
type Edge = EdgeString | number;
type ProgressIntersection = [number, number];
type Intersection = `${Edge} ${Edge}`;
type ScrollOffset = Array<Edge | Intersection | ProgressIntersection>;
interface ScrollInfoOptions {
    container?: Element;
    target?: Element;
    axis?: "x" | "y";
    offset?: ScrollOffset;
    /**
     * When true, enables per-frame checking of scrollWidth/scrollHeight
     * to detect content size changes and recalculate scroll progress.
     *
     * @default false
     */
    trackContentSize?: boolean;
}

declare function scroll(onScroll: OnScroll | AnimationPlaybackControls, { axis, container, ...options }?: ScrollOptions): VoidFunction;

declare function scrollInfo(onScroll: OnScrollInfo, { container, trackContentSize, ...options }?: ScrollInfoOptions): VoidFunction;

type ViewChangeHandler = (entry: IntersectionObserverEntry) => void;
type MarginValue = `${number}${"px" | "%"}`;
type MarginType = MarginValue | `${MarginValue} ${MarginValue}` | `${MarginValue} ${MarginValue} ${MarginValue}` | `${MarginValue} ${MarginValue} ${MarginValue} ${MarginValue}`;
interface InViewOptions {
    root?: Element | Document;
    margin?: MarginType;
    amount?: "some" | "all" | number;
}
declare function inView(elementOrSelector: ElementOrSelector, onStart: (element: Element, entry: IntersectionObserverEntry) => void | ViewChangeHandler, { root, margin: rootMargin, amount }?: InViewOptions): VoidFunction;

interface HTMLElements {
    a: HTMLAnchorElement;
    abbr: HTMLElement;
    address: HTMLElement;
    area: HTMLAreaElement;
    article: HTMLElement;
    aside: HTMLElement;
    audio: HTMLAudioElement;
    b: HTMLElement;
    base: HTMLBaseElement;
    bdi: HTMLElement;
    bdo: HTMLElement;
    big: HTMLElement;
    blockquote: HTMLQuoteElement;
    body: HTMLBodyElement;
    br: HTMLBRElement;
    button: HTMLButtonElement;
    canvas: HTMLCanvasElement;
    caption: HTMLElement;
    center: HTMLElement;
    cite: HTMLElement;
    code: HTMLElement;
    col: HTMLTableColElement;
    colgroup: HTMLTableColElement;
    data: HTMLDataElement;
    datalist: HTMLDataListElement;
    dd: HTMLElement;
    del: HTMLModElement;
    details: HTMLDetailsElement;
    dfn: HTMLElement;
    dialog: HTMLDialogElement;
    div: HTMLDivElement;
    dl: HTMLDListElement;
    dt: HTMLElement;
    em: HTMLElement;
    embed: HTMLEmbedElement;
    fieldset: HTMLFieldSetElement;
    figcaption: HTMLElement;
    figure: HTMLElement;
    footer: HTMLElement;
    form: HTMLFormElement;
    h1: HTMLHeadingElement;
    h2: HTMLHeadingElement;
    h3: HTMLHeadingElement;
    h4: HTMLHeadingElement;
    h5: HTMLHeadingElement;
    h6: HTMLHeadingElement;
    head: HTMLHeadElement;
    header: HTMLElement;
    hgroup: HTMLElement;
    hr: HTMLHRElement;
    html: HTMLHtmlElement;
    i: HTMLElement;
    iframe: HTMLIFrameElement;
    img: HTMLImageElement;
    input: HTMLInputElement;
    ins: HTMLModElement;
    kbd: HTMLElement;
    keygen: HTMLElement;
    label: HTMLLabelElement;
    legend: HTMLLegendElement;
    li: HTMLLIElement;
    link: HTMLLinkElement;
    main: HTMLElement;
    map: HTMLMapElement;
    mark: HTMLElement;
    menu: HTMLElement;
    menuitem: HTMLElement;
    meta: HTMLMetaElement;
    meter: HTMLMeterElement;
    nav: HTMLElement;
    noindex: HTMLElement;
    noscript: HTMLElement;
    object: HTMLObjectElement;
    ol: HTMLOListElement;
    optgroup: HTMLOptGroupElement;
    option: HTMLOptionElement;
    output: HTMLOutputElement;
    p: HTMLParagraphElement;
    param: HTMLParamElement;
    picture: HTMLElement;
    pre: HTMLPreElement;
    progress: HTMLProgressElement;
    q: HTMLQuoteElement;
    rp: HTMLElement;
    rt: HTMLElement;
    ruby: HTMLElement;
    s: HTMLElement;
    samp: HTMLElement;
    search: HTMLElement;
    slot: HTMLSlotElement;
    script: HTMLScriptElement;
    section: HTMLElement;
    select: HTMLSelectElement;
    small: HTMLElement;
    source: HTMLSourceElement;
    span: HTMLSpanElement;
    strong: HTMLElement;
    style: HTMLStyleElement;
    sub: HTMLElement;
    summary: HTMLElement;
    sup: HTMLElement;
    table: HTMLTableElement;
    template: HTMLTemplateElement;
    tbody: HTMLTableSectionElement;
    td: HTMLTableDataCellElement;
    textarea: HTMLTextAreaElement;
    tfoot: HTMLTableSectionElement;
    th: HTMLTableHeaderCellElement;
    thead: HTMLTableSectionElement;
    time: HTMLTimeElement;
    title: HTMLTitleElement;
    tr: HTMLTableRowElement;
    track: HTMLTrackElement;
    u: HTMLElement;
    ul: HTMLUListElement;
    var: HTMLElement;
    video: HTMLVideoElement;
    wbr: HTMLElement;
    webview: HTMLWebViewElement;
}

declare const distance: (a: number, b: number) => number;
declare function distance2D(a: Point, b: Point): number;

export { type AbsoluteKeyframe, type AnimationSequence, type At, type DOMSegment, type DOMSegmentWithTransition, type FunctionSegment, type HTMLElements, type MotionValueSegment, type MotionValueSegmentWithTransition, type ObjectSegment, type ObjectSegmentWithTransition, type ObjectTarget, type ResolvedAnimationDefinition, type ResolvedAnimationDefinitions, type Segment, type SegmentTransitionOptions, type SegmentValueTransitionOptions, type SequenceLabel, type SequenceLabelWithTime, type SequenceMap, type SequenceOptions, type SequenceProgressCallback, type SequenceTime, type ValueSequence, animate, animateMini, createScopedAnimate, distance, distance2D, inView, scroll, scrollInfo };
