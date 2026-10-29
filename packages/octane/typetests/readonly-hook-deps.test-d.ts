import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	type DependencyList,
} from 'octane';
import {
	useCallback as useServerCallback,
	useEffect as useServerEffect,
	useImperativeHandle as useServerImperativeHandle,
	useInsertionEffect as useServerInsertionEffect,
	useLayoutEffect as useServerLayoutEffect,
	useMemo as useServerMemo,
} from 'octane/server';
import {
	useCallback as useUniversalCallback,
	useEffect as useUniversalEffect,
	useInsertionEffect as useUniversalInsertionEffect,
	useLayoutEffect as useUniversalLayoutEffect,
	useMemo as useUniversalMemo,
} from 'octane/universal';

// React types every dependency list as `DependencyList` (`readonly unknown[]`),
// so a list a custom hook receives, or an `as const` tuple, passes straight
// through to a built-in hook.
declare const dependencies: DependencyList;
const tuple = [1, 'two'] as const;
const ref = { current: null as { focus(): void } | null };

useEffect(() => {}, dependencies);
useLayoutEffect(() => {}, dependencies);
useInsertionEffect(() => {}, tuple);
const memo: number = useMemo(() => 1, dependencies);
const callback: () => void = useCallback(() => {}, tuple);
useImperativeHandle(ref, () => ({ focus() {} }), dependencies);

useServerEffect(() => {}, dependencies);
useServerLayoutEffect(() => {}, dependencies);
useServerInsertionEffect(() => {}, tuple);
const serverMemo: number = useServerMemo(() => 1, dependencies);
const serverCallback: () => void = useServerCallback(() => {}, tuple);
useServerImperativeHandle(ref, () => ({ focus() {} }), dependencies);

useUniversalEffect(() => {}, dependencies);
useUniversalLayoutEffect(() => {}, dependencies);
useUniversalInsertionEffect(() => {}, tuple);
const universalMemo: number = useUniversalMemo(() => 1, dependencies);
const universalCallback: () => void = useUniversalCallback(() => {}, tuple);

// @ts-expect-error A dependency list is an array, not a single value.
useEffect(() => {}, 1);
// @ts-expect-error A dependency list is an array, not a single value.
useServerMemo(() => 1, 'deps');
