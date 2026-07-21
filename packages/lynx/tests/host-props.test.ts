import { describe, expect, it } from 'vitest';
import {
	LYNX_CSS_SCOPE_PROP,
	classifyLynxHostPropName,
	decodeLynxAssetSource,
	decodeLynxCSSScopeMetadata,
	isSupportedLynxLengthLiteral,
	normalizeLynxClass,
	normalizeLynxDataset,
	normalizeLynxInlineStyle,
	planLynxHostPropPatch,
} from '../src/core/host-props.js';
import { attachThreadFunction } from '../src/core/worklets.js';

function attributes(patch: ReturnType<typeof planLynxHostPropPatch>): Record<string, unknown> {
	return Object.fromEntries(patch.attributes.map(({ name, value }) => [name, value]));
}

describe('Lynx host prop normalization', () => {
	it('composes class and className values with Octane clsx semantics', () => {
		expect(
			normalizeLynxClass(['card', { selected: true, disabled: false }, [2, 0, 'raised']]),
		).toBe('card selected 2 raised');
		expect(normalizeLynxClass([null, undefined, false, true, ''])).toBe('');

		const created = planLynxHostPropPatch('view', {}, { class: ['a', { b: true }] });
		expect(created.classes?.value).toBe('a b');

		const alias = planLynxHostPropPatch(
			'view',
			{ class: 'old' },
			{ class: 'ignored', className: ['new', { active: true }] },
		);
		expect(alias.classes?.value).toBe('new active');
		expect(planLynxHostPropPatch('view', { class: ['a'] }, { className: 'a' }).classes).toBe(
			undefined,
		);
		expect(planLynxHostPropPatch('view', { class: 'a' }, {}).classes?.value).toBe('');
	});

	it('serializes object styles, custom properties, and supported Lynx units', () => {
		expect(
			normalizeLynxInlineStyle({
				backgroundColor: 'red',
				width: '100rpx',
				WebkitTransform: 'scale(1)',
				'--brand-gap': '2rem',
				opacity: 0.5,
				ignored: null,
			}),
		).toBe(
			'background-color:red;width:100rpx;-webkit-transform:scale(1);--brand-gap:2rem;opacity:0.5',
		);
		expect(normalizeLynxInlineStyle('width: calc(100% - 2rpx);')).toBe('width: calc(100% - 2rpx);');

		for (const value of ['1px', '2rpx', '3ppx', '4em', '5rem', '6vh', '7vw', '8%', '0']) {
			expect(isSupportedLynxLengthLiteral(value), value).toBe(true);
		}
		expect(isSupportedLynxLengthLiteral('1pt')).toBe(false);
		expect(isSupportedLynxLengthLiteral('1')).toBe(false);
		expect(() => normalizeLynxInlineStyle({ width: '12pt' })).toThrow(/unsupported Lynx length/);
		expect(() => normalizeLynxInlineStyle({ width: false })).toThrow(/must be a string, number/);
		expect(() => normalizeLynxInlineStyle({ opacity: Number.NaN })).toThrow(/must be finite/);
	});

	it('diffs normalized styles instead of object identity and clears removed styles', () => {
		expect(
			planLynxHostPropPatch(
				'view',
				{ style: { backgroundColor: 'red', width: '10px' } },
				{ style: { backgroundColor: 'red', width: '10px' } },
			).inlineStyles,
		).toBe(undefined);
		expect(
			planLynxHostPropPatch('view', { style: { width: '10px' } }, {}).inlineStyles?.value,
		).toBe('');
	});

	it('normalizes data-* keys and plans one complete replacement with removals', () => {
		const normalized = normalizeLynxDataset({
			'data-user-id': 7,
			'data-active': false,
			'data-removed': null,
			title: 'ignored',
		});
		expect({ ...normalized }).toEqual({ 'user-id': 7, active: false, removed: null });

		const patch = planLynxHostPropPatch(
			'view',
			{ 'data-user-id': 7, 'data-old': 'remove' },
			{ 'data-user-id': 8, 'data-active': true },
		);
		expect({ ...patch.dataset?.value }).toEqual({ 'user-id': 8, active: true });
		expect(patch.dataset?.removed).toEqual(['old']);

		const clear = planLynxHostPropPatch('view', { 'data-user-id': 7 }, {});
		expect({ ...clear.dataset?.value }).toEqual({});
		expect(clear.dataset?.removed).toEqual(['user-id']);
		expect(() => normalizeLynxDataset({ 'data-': true })).toThrow(/non-empty key/);
	});
});

describe('Lynx CSS scope and asset transport', () => {
	it('decodes the public __SetCSSId argument shapes', () => {
		expect(decodeLynxCSSScopeMetadata(1185352)).toEqual({ cssId: 1185352 });
		expect(decodeLynxCSSScopeMetadata({ cssId: 100, entryName: '__Card__' })).toEqual({
			cssId: 100,
		});
		expect(decodeLynxCSSScopeMetadata({ cssId: 100, entryName: 'settings' })).toEqual({
			cssId: 100,
			entryName: 'settings',
		});
		expect(decodeLynxCSSScopeMetadata({ entryName: 'lazy-card' })).toEqual({
			cssId: 0,
			entryName: 'lazy-card',
		});
		expect(decodeLynxCSSScopeMetadata({})).toBe(null);
		expect(decodeLynxCSSScopeMetadata({ cssId: -1 })).toEqual({ cssId: -1 });
		for (const cssId of [Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => decodeLynxCSSScopeMetadata({ cssId })).toThrow(/safe integer/);
		}
		expect(() => decodeLynxCSSScopeMetadata({ cssId: 1, privateField: true })).toThrow(
			/unknown field/,
		);
	});

	it('routes compiler CSS metadata separately and recreates only when it must be cleared', () => {
		const metadata = { cssId: 1185352, entryName: 'lazy-card' };
		const created = planLynxHostPropPatch('view', {}, { [LYNX_CSS_SCOPE_PROP]: metadata });
		expect(created.cssScope?.value).toEqual(metadata);
		expect(attributes(created)).toEqual({});
		expect(created.requiresRecreate).toBe(false);

		const removed = planLynxHostPropPatch('view', { [LYNX_CSS_SCOPE_PROP]: metadata }, {});
		expect(removed.cssScope).toBe(undefined);
		expect(removed.requiresRecreate).toBe(true);
	});

	it('preserves Rspeedy-emitted URLs and data URIs without inventing resource handles', () => {
		for (const source of [
			'https://cdn.example.com/assets/logo.abc123.png',
			'/assets/logo.abc123.png',
			'data:image/png;base64,AA==',
		]) {
			expect(decodeLynxAssetSource(source)).toBe(source);
		}
		expect(decodeLynxAssetSource(null)).toBe(null);
		expect(() => decodeLynxAssetSource({ $$kind: 'octane.universal.resource', id: 1 })).toThrow(
			/bundled URL string/,
		);

		const update = planLynxHostPropPatch(
			'image',
			{ src: '/old.png', placeholder: 'data:image/png;base64,AA==' },
			{ src: '/new.png' },
		);
		expect(attributes(update)).toEqual({ src: '/new.png', placeholder: null });
	});
});

describe('Lynx host prop routing', () => {
	it('keeps PAPI-special and callback props out of ordinary attributes', () => {
		expect(classifyLynxHostPropName('id')).toBe('id');
		expect(classifyLynxHostPropName('className')).toBe('classes');
		expect(classifyLynxHostPropName('style')).toBe('inline-styles');
		expect(classifyLynxHostPropName('data-user-id')).toBe('dataset');
		expect(classifyLynxHostPropName('bindtap')).toBe('event');
		expect(classifyLynxHostPropName('main-thread:catchtap')).toBe('main-thread-event');
		expect(classifyLynxHostPropName('main-thread:ref')).toBe('main-thread-ref');
		expect(classifyLynxHostPropName('foreign:bindtap')).toBe('reserved');
		expect(classifyLynxHostPropName('octane-ref')).toBe('reserved');
		expect(classifyLynxHostPropName('css-id')).toBe('reserved');
		expect(classifyLynxHostPropName('ref')).toBe('reserved');
		expect(classifyLynxHostPropName('title')).toBe('attribute');

		const patch = planLynxHostPropPatch(
			'view',
			{ id: 'old', title: 'old', hidden: true },
			{
				id: 'next',
				class: ['card'],
				style: { width: '10rpx' },
				'data-index': 1,
				bindtap: 42,
				ref: 9,
				title: undefined,
			},
		);
		expect(patch.id?.value).toBe('next');
		expect(patch.classes?.value).toBe('card');
		expect(patch.inlineStyles?.value).toBe('width:10rpx');
		expect({ ...patch.dataset?.value }).toEqual({ index: 1 });
		expect(attributes(patch)).toEqual({ title: null, hidden: null });
		expect(() => planLynxHostPropPatch('view', {}, { 'octane-ref': 'foreign-selector' })).toThrow(
			/reserved for generation-scoped query handles/,
		);
		expect(() => planLynxHostPropPatch('view', {}, { 'main-thread:bindtap': 42 })).toThrow(
			/main-thread worklet descriptor/,
		);
	});

	it('routes clone-safe main-thread events and refs as dedicated semantic patches', () => {
		const tap = { _wkltId: 'card.tsrx:tap', _c: { count: 1, ref: { _wvid: 'card:ref' } } };
		const ref = { _wvid: 'card:ref' };
		const created = planLynxHostPropPatch(
			'view',
			{},
			{ 'main-thread:bindtap': tap, 'main-thread:ref': ref },
		);

		expect(created.mainThreadEvents).toEqual([
			{
				binding: {
					prop: 'main-thread:bindtap',
					prefix: 'bind',
					type: 'bindEvent',
					name: 'tap',
				},
				value: tap,
			},
		]);
		expect(created.mainThreadRef?.value).toBe(ref);
		expect(attributes(created)).toEqual({});
		expect(
			planLynxHostPropPatch(
				'view',
				{ 'main-thread:bindtap': tap, 'main-thread:ref': ref },
				{
					'main-thread:bindtap': {
						_wkltId: 'card.tsrx:tap',
						_c: { count: 1, ref: { _wvid: 'card:ref' } },
					},
					'main-thread:ref': { _wvid: 'card:ref' },
				},
			).mainThreadEvents,
		).toEqual([]);

		const removed = planLynxHostPropPatch(
			'view',
			{ 'main-thread:bindtap': tap, 'main-thread:ref': ref },
			{},
		);
		expect(removed.mainThreadEvents[0]?.value).toBe(null);
		expect(removed.mainThreadRef?.value).toBe(null);
	});

	it('rebinds a main-thread event when capture alias topology changes', () => {
		const shared = { value: 1 };
		const aliased = {
			_wkltId: 'card.tsrx:alias',
			_c: { values: [shared, shared] },
		};
		const distinct = {
			_wkltId: 'card.tsrx:alias',
			_c: { values: [{ value: 1 }, { value: 1 }] },
		};
		const nextShared = { value: 1 };
		const equivalentlyAliased = {
			_wkltId: 'card.tsrx:alias',
			_c: { values: [nextShared, nextShared] },
		};

		expect(
			planLynxHostPropPatch(
				'view',
				{ 'main-thread:bindtap': aliased },
				{ 'main-thread:bindtap': distinct },
			).mainThreadEvents,
		).toHaveLength(1);
		expect(
			planLynxHostPropPatch(
				'view',
				{ 'main-thread:bindtap': distinct },
				{ 'main-thread:bindtap': aliased },
			).mainThreadEvents,
		).toHaveLength(1);
		expect(
			planLynxHostPropPatch(
				'view',
				{ 'main-thread:bindtap': aliased },
				{ 'main-thread:bindtap': equivalentlyAliased },
			).mainThreadEvents,
		).toEqual([]);
	});

	it('unwraps compiler-tagged main-thread functions at the host prop boundary', () => {
		const handler = attachThreadFunction(
			function handler() {},
			'main-thread',
			'host-props.test:tap',
			() => [{ count: 1 }],
		);

		const patch = planLynxHostPropPatch('view', {}, { 'main-thread:bindtap': handler });

		expect(patch.mainThreadEvents).toEqual([
			{
				binding: {
					prop: 'main-thread:bindtap',
					prefix: 'bind',
					type: 'bindEvent',
					name: 'tap',
				},
				value: { _wkltId: 'host-props.test:tap', _c: { values: [{ count: 1 }] } },
			},
		]);
	});

	it('rejects main/background channel collisions and non-clone-safe worklet values', () => {
		expect(() =>
			planLynxHostPropPatch(
				'raw-text',
				{},
				{
					'main-thread:bindtap': { _wkltId: 'tap' },
				},
			),
		).toThrow(/raw-text hosts cannot own direct main-thread prop/);
		expect(() =>
			planLynxHostPropPatch(
				'raw-text',
				{},
				{
					'main-thread:ref': { _wvid: 'label' },
				},
			),
		).toThrow(/raw-text hosts cannot own direct main-thread prop/);
		expect(() =>
			planLynxHostPropPatch(
				'view',
				{},
				{
					bindtap: 1,
					'main-thread:bindtap': { _wkltId: 'tap' },
				},
			),
		).toThrow(/conflicts with "bindtap"/);
		expect(() =>
			planLynxHostPropPatch(
				'view',
				{},
				{
					'main-thread:bindtap': { _wkltId: 'tap', _c: { callback() {} } },
				},
			),
		).toThrow(/non-clone-safe/);
		expect(() =>
			planLynxHostPropPatch('view', {}, { 'main-thread:gesture': { _wkltId: 'gesture' } }),
		).toThrow(/not a supported Lynx host capability/);
	});
});
