import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	DynamicHost,
	DirectCreateElement,
	MutableInputHandler,
	NamespaceText,
	NegativeHosts,
	PortalText,
	SpreadText,
	SpreadTextarea,
	StaticText,
	ValueText,
} from './_fixtures/native-change-diagnostics.tsrx';

const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
const noop = () => {};
const server = loadServerFixture<typeof import('./_fixtures/native-change-diagnostics.tsrx')>(
	'packages/octane/tests/_fixtures/native-change-diagnostics.tsrx',
);

afterEach(() => {
	vi.restoreAllMocks();
});

function diagnosticCalls(spy: ReturnType<typeof vi.spyOn>) {
	return spy.mock.calls.filter((call) => String(call[0]).includes('[OCTANE_NATIVE_TEXT_ONCHANGE]'));
}

describe('native text change development diagnostic', () => {
	it('warns once per broken episode and resets after a valid final-props state', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = { onChange: noop };
		const result = mount(SpreadText, { hostProps: broken });
		try {
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
			if (!PROD_COMPILE) {
				expect(diagnosticCalls(error)[0][0]).toContain('Use `onInput`');
			}

			error.mockClear();
			result.update(SpreadText, { hostProps: broken });
			expect(diagnosticCalls(error)).toHaveLength(0);

			result.update(SpreadText, { hostProps: { onChange: noop, onInput: noop } });
			expect(diagnosticCalls(error)).toHaveLength(0);

			result.update(SpreadText, { hostProps: broken });
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);

			error.mockClear();
			result.update(SpreadText, {
				hostProps: { onChange: noop, suppressNativeChangeWarning: true },
			});
			const input = result.find('#spread-text');
			expect(input.hasAttribute('suppressNativeChangeWarning')).toBe(false);
			expect(diagnosticCalls(error)).toHaveLength(0);

			result.update(SpreadText, {
				hostProps: { onChange: noop, suppressNativeChangeWarning: false },
			});
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			result.unmount();
		}
	});

	it('uses the capture-phase replacement and counts only dispatchable final slots', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = mount(SpreadTextarea, {
			hostProps: { onChangeCapture: noop, onInput: {} },
		});
		try {
			const warnings = diagnosticCalls(error);
			expect(warnings).toHaveLength(PROD_COMPILE ? 0 : 1);
			if (!PROD_COMPILE) expect(warnings[0][0]).toContain('Use `onInputCapture`');

			error.mockClear();
			result.update(SpreadTextarea, {
				hostProps: { onChangeCapture: noop, onInput: noop },
			});
			expect(diagnosticCalls(error)).toHaveLength(0);

			result.update(SpreadTextarea, {
				hostProps: { onChange: null, onChangeCapture: undefined },
			});
			expect(diagnosticCalls(error)).toHaveLength(0);
		} finally {
			result.unmount();
		}
	});

	it('classifies the live input type and skips read-only, disabled, and non-text hosts', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = mount(SpreadText, {
			hostProps: { type: 'checkbox', onChange: noop },
		});
		try {
			expect(diagnosticCalls(error)).toHaveLength(0);
			result.update(SpreadText, { hostProps: { type: 'text', onChange: noop } });
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);

			error.mockClear();
			result.update(SpreadText, {
				hostProps: { type: 'text', onChange: noop, readOnly: true },
			});
			expect(diagnosticCalls(error)).toHaveLength(0);
			result.update(SpreadText, {
				hostProps: { type: 'text', onChange: noop, disabled: true },
			});
			expect(diagnosticCalls(error)).toHaveLength(0);

			result.update(SpreadText, { hostProps: { type: 'text', onChange: noop } });
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			result.unmount();
		}

		error.mockClear();
		const negatives = mount(NegativeHosts, { hostProps: { onChange: noop } });
		try {
			expect(diagnosticCalls(error)).toHaveLength(0);
		} finally {
			negatives.unmount();
		}
	});

	it('reports controlled commit-only text without duplicating the read-only warning', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = mount(SpreadText, {
			hostProps: { value: 'locked', onChange: noop },
		});
		try {
			const warnings = diagnosticCalls(error);
			expect(warnings).toHaveLength(PROD_COMPILE ? 0 : 1);
			if (!PROD_COMPILE) expect(warnings[0][0]).toContain('use `defaultValue`');
			expect(
				error.mock.calls.filter((call) =>
					String(call[0]).startsWith('You provided a `value` prop'),
				),
			).toHaveLength(0);

			error.mockClear();
			result.update(SpreadText, {
				hostProps: {
					value: 'locked',
					onChange: noop,
					suppressNativeChangeWarning: true,
				},
			});
			expect(error).not.toHaveBeenCalled();

			result.update(SpreadText, { hostProps: { value: 'locked' } });
			const readOnlyWarnings = error.mock.calls.filter((call) =>
				String(call[0]).includes('without an `onInput` handler'),
			);
			expect(readOnlyWarnings).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			result.unmount();
		}
	});

	it('does not repeat a statically published warning at runtime', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = mount(StaticText);
		try {
			expect(diagnosticCalls(error)).toHaveLength(0);
		} finally {
			result.unmount();
		}
	});

	it('validates a writable input-handler binding after its final assignment', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = mount(MutableInputHandler, { removeInput: false });
		try {
			expect(diagnosticCalls(error)).toHaveLength(0);
			result.update(MutableInputHandler, { removeInput: true });
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			result.unmount();
		}
	});

	it('keeps suppression intent and compiler metadata out of server markup', () => {
		const direct = ServerRuntime.renderToString(server.SuppressedStaticText).html;
		const spread = ServerRuntime.renderToString(server.SpreadText, {
			hostProps: {
				'data-kept': 'yes',
				onChange: noop,
				suppressNativeChangeWarning: true,
				__octaneNativeChangeDiagnostic: 'runtime',
			},
		}).html;

		expect(direct).toContain('id="suppressed-static-text"');
		expect(spread).toContain('data-kept="yes"');
		for (const html of [direct, spread]) {
			expect(html).not.toContain('suppressNativeChangeWarning');
			expect(html).not.toContain('__octaneNativeChangeDiagnostic');
		}
	});

	it('is consistent for value-position, dynamic-host, portal, and namespace paths', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const value = mount(ValueText, { hostProps: { onChange: noop } });
		try {
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			value.unmount();
		}

		error.mockClear();
		const dynamic = mount(DynamicHost, {
			host: 'input',
			hostProps: { onChange: noop },
		});
		try {
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			dynamic.unmount();
		}

		error.mockClear();
		const direct = mount(DirectCreateElement, { hostProps: { onChange: noop } });
		try {
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
			direct.update(DirectCreateElement, {
				hostProps: { onChange: noop, onInput: noop },
			});
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			direct.unmount();
		}

		error.mockClear();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const portal = mount(PortalText, { target, hostProps: { onChange: noop } });
		try {
			expect(target.querySelector('#portal-text')).not.toBeNull();
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			portal.unmount();
			target.remove();
		}

		error.mockClear();
		const namespaces = mount(NamespaceText, { hostProps: { onChange: noop } });
		try {
			const svgInput = namespaces.find('#svg-input');
			const htmlInput = namespaces.find('#foreign-input');
			expect(svgInput.namespaceURI).toBe('http://www.w3.org/2000/svg');
			expect(htmlInput.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
		} finally {
			namespaces.unmount();
		}
	});

	it('validates adopted and replacement hydration hosts after final client props', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			container.innerHTML = '<input id="spread-text">';
			const adopted = container.firstElementChild as HTMLInputElement;
			adopted.value = 'before-hydration';
			const root = hydrateRoot(container, SpreadText, {
				hostProps: { onChange: noop },
			});
			flushSync(() => {});
			expect(container.firstElementChild).toBe(adopted);
			expect(adopted.value).toBe('before-hydration');
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
			root.unmount();

			error.mockClear();
			container.innerHTML = '<textarea id="stale"></textarea>';
			const stale = container.firstElementChild;
			const replacementRoot = hydrateRoot(container, SpreadText, {
				hostProps: { onChange: noop },
			});
			flushSync(() => {});
			expect(container.firstElementChild).not.toBe(stale);
			expect(container.firstElementChild?.localName).toBe('input');
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
			replacementRoot.unmount();

			error.mockClear();
			container.innerHTML = '<input id="direct-create-element">';
			const directServerNode = container.firstElementChild;
			const directRoot = hydrateRoot(container, DirectCreateElement, {
				hostProps: { onChange: noop },
			});
			flushSync(() => {});
			// Direct createElement is a de-optimized host, so hydration rebuilds it;
			// the development fallback still owns the final-props diagnostic.
			expect(container.firstElementChild).not.toBe(directServerNode);
			expect(container.firstElementChild?.id).toBe('direct-create-element');
			expect(diagnosticCalls(error)).toHaveLength(PROD_COMPILE ? 0 : 1);
			directRoot.unmount();
		} finally {
			container.remove();
		}
	});
});
