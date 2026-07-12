/**
 * Server runtime (final phase) — the vendored cookie/session surface
 * (createCookie/createSession/createCookieSessionStorage/
 * createMemorySessionStorage) and the framework/RSC throwing-stub policy.
 * Ported per react-router __tests__/{cookies,sessions}-test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
	Meta,
	UNSAFE_ServerMode,
	createCookie,
	createCookieSessionStorage,
	createMemorySessionStorage,
	createRequestHandler,
	createRoutesStub,
	createSession,
	isCookie,
	isSession,
	unstable_RSCStaticRouter,
} from '@octanejs/remix-router';

describe('cookies', () => {
	it('serializes and parses values round-trip', async () => {
		// Per cookies-test.ts "parses/serializes values".
		const cookie = createCookie('my-cookie');
		expect(isCookie(cookie)).toBe(true);
		expect(cookie.name).toBe('my-cookie');
		expect(cookie.isSigned).toBe(false);

		const setCookie = await cookie.serialize({ hello: 'octane' });
		const value = await cookie.parse(setCookie.split(';')[0]);
		expect(value).toEqual({ hello: 'octane' });
	});

	it('signed cookies round-trip and reject tampering', async () => {
		// Per cookies-test.ts "fails to parses signed string with invalid signature".
		const cookie = createCookie('signed', { secrets: ['s3cret'] });
		expect(cookie.isSigned).toBe(true);

		const setCookie = await cookie.serialize('hello');
		expect(await cookie.parse(setCookie.split(';')[0])).toBe('hello');

		const tampered = createCookie('signed', { secrets: ['different'] });
		expect(await tampered.parse(setCookie.split(';')[0])).toBe(null);
	});
});

describe('sessions', () => {
	it('createSession get/set/flash/unset semantics', () => {
		// Per sessions-test.ts "flash/get/set".
		const session = createSession();
		expect(isSession(session)).toBe(true);

		session.set('user', 'dominic');
		session.flash('note', 'saved!');
		expect(session.get('user')).toBe('dominic');
		expect(session.has('note')).toBe(true);
		expect(session.get('note')).toBe('saved!'); // flash reads once…
		expect(session.has('note')).toBe(false); // …then clears

		session.unset('user');
		expect(session.has('user')).toBe(false);
	});

	it('cookie session storage round-trips through Set-Cookie', async () => {
		// Per sessions-test.ts "persists session data across requests".
		const storage = createCookieSessionStorage({
			cookie: { name: '__session', secrets: ['s3cret'] },
		});
		let session = await storage.getSession();
		session.set('user', 'dominic');
		const setCookie = await storage.commitSession(session);

		session = await storage.getSession(setCookie.split(';')[0]);
		expect(session.get('user')).toBe('dominic');

		const destroyCookie = await storage.destroySession(session);
		expect(destroyCookie).toContain('Expires=Thu, 01 Jan 1970');
	});

	it('memory session storage round-trips by id', async () => {
		// Per sessions-test.ts memory storage cases.
		const storage = createMemorySessionStorage({
			cookie: { name: '__session', secrets: ['s3cret'] },
		});
		let session = await storage.getSession();
		session.set('count', 7);
		const setCookie = await storage.commitSession(session);

		session = await storage.getSession(setCookie.split(';')[0]);
		expect(session.get('count')).toBe(7);
	});
});

describe('framework/RSC stub policy', () => {
	it('framework-mode APIs throw with the scope-policy message when invoked', () => {
		expect(() => (Meta as any)()).toThrow(/FRAMEWORK mode/);
		expect(() => (createRoutesStub as any)()).toThrow(/FRAMEWORK mode/);
		expect(() => (createRequestHandler as any)()).toThrow(/FRAMEWORK mode/);
	});

	it('RSC APIs throw with the RSC-policy message when invoked', () => {
		expect(() => (unstable_RSCStaticRouter as any)()).toThrow(/RSC integration/);
	});

	it('UNSAFE_ServerMode is the real vendored enum', () => {
		expect(UNSAFE_ServerMode.Development).toBe('development');
		expect(UNSAFE_ServerMode.Production).toBe('production');
		expect(UNSAFE_ServerMode.Test).toBe('test');
	});
});
