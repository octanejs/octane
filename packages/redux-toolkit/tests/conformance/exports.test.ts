import { describe, expect, it } from 'vitest';
import * as toolkit from '@octanejs/redux-toolkit';
import * as toolkitReact from '@octanejs/redux-toolkit/react';
import * as query from '@octanejs/redux-toolkit/query';
import * as queryReact from '@octanejs/redux-toolkit/query/react';
import * as upstreamToolkit from '@reduxjs/toolkit';
import * as upstreamToolkitReact from '@reduxjs/toolkit/react';
import * as upstreamQuery from '@reduxjs/toolkit/query';
import * as upstreamQueryReact from '@reduxjs/toolkit/query/react';

function expectSameSurface(port: object, upstream: object) {
	expect(Object.keys(port).sort()).toEqual(Object.keys(upstream).sort());
}

describe('@octanejs/redux-toolkit export surface', () => {
	it('matches all four upstream runtime entry points in both directions', () => {
		expectSameSurface(toolkit, upstreamToolkit);
		expectSameSurface(toolkitReact, upstreamToolkitReact);
		expectSameSurface(query, upstreamQuery);
		expectSameSurface(queryReact, upstreamQueryReact);
	});

	it('reuses the framework-agnostic core by identity', () => {
		expect(toolkit.configureStore).toBe(upstreamToolkit.configureStore);
		expect(toolkit.createSlice).toBe(upstreamToolkit.createSlice);
		expect(query.buildCreateApi).toBe(upstreamQuery.buildCreateApi);
		expect(query.fetchBaseQuery).toBe(upstreamQuery.fetchBaseQuery);
	});

	it('replaces only the two React-specific implementations', () => {
		expect(toolkitReact.createDynamicMiddleware).not.toBe(
			upstreamToolkitReact.createDynamicMiddleware,
		);
		expect(queryReact.createApi).not.toBe(upstreamQueryReact.createApi);
	});
});
