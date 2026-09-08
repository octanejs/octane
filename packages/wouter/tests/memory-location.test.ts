// Per packages/wouter/upstream/canonical/test/memory-location.test.ts
import { act, renderHook } from '@octanejs/testing-library';
import { expect, test } from 'vitest';
import { memoryLocation } from '@octanejs/wouter/memory-location';

test('returns a hook that is compatible with location spec', () => {
	const { hook } = memoryLocation();
	const { result } = renderHook(() => hook());
	const [value, update] = result.current;
	expect(typeof value).toBe('string');
	expect(typeof update).toBe('function');
});

test('should support initial path', () => {
	const { hook } = memoryLocation({ path: '/test-case' });
	const { result } = renderHook(() => hook());
	expect(result.current[0]).toBe('/test-case');
});

test('should support initial state', () => {
	const memory = memoryLocation({
		path: '/test-case',
		state: { from: 'test' },
	});
	expect(memory.state).toStrictEqual({ from: 'test' });
});

test('should support initial path with query', () => {
	const { searchHook } = memoryLocation({ path: '/test-case?foo=bar' });
	const { result } = renderHook(() => searchHook());
	expect(result.current).toBe('foo=bar');
});

test('should support search path as parameter', () => {
	const { searchHook } = memoryLocation({
		path: '/test-case?foo=bar',
		searchPath: 'key=value',
	});
	const { result } = renderHook(() => searchHook());
	expect(result.current).toBe('foo=bar&key=value');
});

test('should return location hook that has initial path "/" by default', () => {
	const { result } = renderHook(() => memoryLocation().hook());
	expect(result.current[0]).toBe('/');
});

test('should return search hook that has initial query "" by default', () => {
	const { result } = renderHook(() => memoryLocation().searchHook());
	expect(result.current).toBe('');
});

test('should return standalone `navigate` method', () => {
	const { hook, navigate } = memoryLocation();
	const { result } = renderHook(() => hook());
	act(() => navigate('/standalone'));
	expect(result.current[0]).toBe('/standalone');
});

test('should update state through standalone `navigate`', () => {
	const memory = memoryLocation({
		path: '/test-case',
		state: { from: 'test' },
	});
	memory.navigate('/standalone', { state: { from: 'navigate' } });
	expect(memory.state).toStrictEqual({ from: 'navigate' });
});

test('should preserve state when navigating without `state` option', () => {
	const memory = memoryLocation({
		path: '/test-case',
		state: { from: 'test' },
	});
	memory.navigate('/standalone');
	expect(memory.state).toStrictEqual({ from: 'test' });
});

test('should return location hook that supports navigation', () => {
	const { hook } = memoryLocation();
	const { result } = renderHook(() => hook());
	act(() => result.current[1]('/location'));
	expect(result.current[0]).toBe('/location');
});

test('should update state through hook navigation', () => {
	const memory = memoryLocation({
		path: '/test-case',
		state: { from: 'test' },
	});
	const { result } = renderHook(() => memory.hook());
	act(() => result.current[1]('/location', { state: { from: 'hook' } }));
	expect(memory.state).toStrictEqual({ from: 'hook' });
});

test('should record all history when `record` option is provided', () => {
	const { hook, history: entries, navigate } = memoryLocation({ record: true, path: '/test' });
	const { result } = renderHook(() => hook());

	act(() => navigate('/standalone'));
	act(() => result.current[1]('/location'));
	expect(result.current[0]).toBe('/location');
	expect(entries).toStrictEqual(['/test', '/standalone', '/location']);

	act(() => navigate('/standalone', { replace: true }));
	expect(entries).toStrictEqual(['/test', '/standalone', '/standalone']);

	act(() => result.current[1]('/location', { replace: true }));
	expect(entries).toStrictEqual(['/test', '/standalone', '/location']);
});

test('should not have history when `record` option is falsy', () => {
	// @ts-expect-error history and reset only exist when record is true.
	const { history: entries, reset } = memoryLocation();
	expect(entries).not.toBeDefined();
	expect(reset).not.toBeDefined();
});

test('should have reset method when `record` option is provided', () => {
	const {
		history: entries,
		reset,
		navigate,
	} = memoryLocation({
		path: '/initial',
		record: true,
	});
	navigate('test-1');
	navigate('test-2');
	reset();
	expect(entries).toStrictEqual(['/initial']);
});

test('should have reset method that reset hook location', () => {
	const {
		hook,
		history: entries,
		navigate,
		reset,
	} = memoryLocation({
		record: true,
		path: '/test',
	});
	const { result } = renderHook(() => hook());

	act(() => navigate('/location'));
	expect(result.current[0]).toBe('/location');
	expect(entries).toStrictEqual(['/test', '/location']);

	act(() => reset());
	expect(entries).toStrictEqual(['/test']);
	expect(result.current[0]).toBe('/test');
});

test('should reset state to its initial value', () => {
	const memory = memoryLocation({
		record: true,
		path: '/test',
		state: { from: 'initial' },
	});
	memory.navigate('/location', { state: { from: 'navigate' } });
	expect(memory.state).toStrictEqual({ from: 'navigate' });
	memory.reset();
	expect(memory.state).toStrictEqual({ from: 'initial' });
});
