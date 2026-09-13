export interface UseOrientationOptions {
    /** Default angle value, used until the real can be retrieved
     * (during server side rendering and before js executes on the page)
     * If not provided, the default value is `0`
     * */
    defaultAngle?: number;
    /** Default angle value, used until the real can be retrieved
     * (during server side rendering and before js executes on the page)
     * If not provided, the default value is `'landscape-primary'`
     * */
    defaultType?: OrientationType;
    /** If true, the initial value will be resolved in useEffect (ssr safe)
     *  If false, the initial value will be resolved in useLayoutEffect (ssr unsafe)
     *  True by default.
     */
    getInitialValueInEffect?: boolean;
}
export interface UseOrientationReturnType {
    angle: number;
    type: OrientationType;
}
export declare function useOrientation({ defaultAngle, defaultType, getInitialValueInEffect, }?: UseOrientationOptions): UseOrientationReturnType;
export declare namespace useOrientation {
    type Options = UseOrientationOptions;
    type ReturnType = UseOrientationReturnType;
}
