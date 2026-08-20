import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { createElement, Fragment, isValidElement, type OctaneNode } from 'octane';
import { setupI18n } from '@lingui/core';
import {
	I18nProvider,
	Trans,
	type TransRenderCallbackOrComponent,
	type TransRenderProps,
} from '../src/index.ts';
import { TransNoContext } from '../src/TransNoContext.tsrx';
import { ComponentFC, DefaultComponent, DefaultComponentFC } from './_fixtures/i18n.tsrx';

afterEach(cleanup);

function withMockConsole(run: (mocked: { error: ReturnType<typeof vi.fn> }) => void) {
	const error = vi.spyOn(console, 'error').mockImplementation(function noop() {});
	try {
		run({ error });
	} finally {
		error.mockRestore();
	}
}

describe('Trans component', function transSuite() {
	// Per packages/lingui/upstream/canonical/src/Trans.test.tsx
	const i18n = setupI18n({
		locale: 'cs',
		messages: {
			cs: {
				'All human beings are born free and equal in dignity and rights.':
					'Všichni lidé rodí se svobodní a sobě rovní co do důstojnosti a práv.',
				'My name is {name}': 'Jmenuji se {name}',
				Original: 'Původní',
				Updated: 'Aktualizovaný',
				ID: 'Translation',
			},
		},
	});

	function renderWithI18n(node: OctaneNode) {
		return render(createElement(I18nProvider, { i18n }, node));
	}
	function text(node: OctaneNode) {
		return renderWithI18n(node).container.textContent;
	}
	function html(node: OctaneNode) {
		return renderWithI18n(node).container.innerHTML;
	}

	describe('should log console.error', function consoleErrorSuite() {
		function renderProp(props: TransRenderProps) {
			return createElement('span', null, 'render_', props.children);
		}
		function component(props: TransRenderProps) {
			return createElement('span', null, 'component_', props.children);
		}

		it('when both `render` and `component` are used, and return `render`', function bothRenderAndComponent() {
			withMockConsole(function assertBoth(consoleMock) {
				const { container } = render(
					createElement(
						I18nProvider,
						{
							i18n,
							defaultComponent: function DefaultTranslation(props: TransRenderProps) {
								return createElement(Fragment, null, 'default_', props.translation);
							},
						},
						createElement(Trans, { render: renderProp, component, id: 'Some text' }),
					),
				);

				expect(consoleMock.error).toHaveBeenCalledWith(
					expect.stringContaining(
						"You can't use both `component` and `render` prop at the same time.",
					),
				);
				expect(container.textContent).toBe('render_Some text');
			});
		});

		it('when `render` is not of type function, and return `defaultComponent`', function invalidRender() {
			withMockConsole(function assertInvalidRender(consoleMock) {
				const { container } = render(
					createElement(
						I18nProvider,
						{
							i18n,
							defaultComponent: function DefaultTranslation(props: TransRenderProps) {
								return createElement(Fragment, null, 'default_', props.translation);
							},
						},
						createElement(Trans, { render: 'invalid' as never, id: 'Some text' }),
					),
				);

				expect(consoleMock.error).toHaveBeenCalledWith(
					expect.stringContaining(
						'Invalid value supplied to prop `render`. It must be a function, provided invalid',
					),
				);
				expect(container.textContent).toBe('default_Some text');
			});
		});

		it('when `component` is not of type function, and return ', function invalidComponent() {
			withMockConsole(function assertInvalidComponent(consoleMock) {
				const { container } = render(
					createElement(
						I18nProvider,
						{
							i18n,
							defaultComponent: function DefaultTranslation(props: TransRenderProps) {
								return createElement(Fragment, null, 'default_', props.translation);
							},
						},
						createElement(Trans, { component: 'invalid' as never, id: 'Some text' }),
					),
				);

				expect(consoleMock.error).toHaveBeenCalledWith(
					expect.stringContaining(
						'Invalid value supplied to prop `component`. It must be a React component, provided invalid',
					),
				);
				expect(container.textContent).toBe('default_Some text');
			});
		});

		it("when there's no i18n context available", function missingProvider() {
			const originalConsole = console.error;
			console.error = vi.fn();

			expect(function renderUnknown() {
				render(createElement(Trans, { id: 'unknown' }));
			}).toThrowError(
				'Trans component was rendered without I18nProvider. Attempted to render message: undefined id: unknown. Make sure this component is rendered inside a I18nProvider.\n\nThis often happens when multiple instances of @lingui/react are installed (e.g. due to a version mismatch or misconfiguration in a monorepo). Verify you have only one version installed by running: npm ls @lingui/react (or pnpm why @lingui/react / yarn why @lingui/react).',
			);
			expect(function renderUnknownWithMessage() {
				render(createElement(Trans, { id: 'unknown', message: 'some valid message' }));
			}).toThrowError(
				'Trans component was rendered without I18nProvider. Attempted to render message: some valid message id: unknown. Make sure this component is rendered inside a I18nProvider.\n\nThis often happens when multiple instances of @lingui/react are installed (e.g. due to a version mismatch or misconfiguration in a monorepo). Verify you have only one version installed by running: npm ls @lingui/react (or pnpm why @lingui/react / yarn why @lingui/react).',
			);

			console.error = originalConsole;
		});

		it('when deprecated string built-ins are used', function deprecatedStringBuiltins() {
			const originalConsole = console.error;
			console.error = vi.fn();

			renderWithI18n(createElement(Trans, { render: 'span' as never, id: 'Some text' }));
			expect(console.error).toHaveBeenCalled();

			renderWithI18n(createElement(Trans, { render: 'span' as never, id: 'Some text' }));
			expect(console.error).toHaveBeenCalledTimes(2);
			console.error = originalConsole;
		});
	});

	it('should follow jsx semantics regarding booleans', function booleanSemantics() {
		expect(
			html(
				createElement(Trans, {
					id: 'unknown',
					message: 'foo <0>{0}</0> bar',
					values: {
						0: false,
					},
					components: {
						0: createElement('span', null),
					},
				}),
			),
		).toEqual('foo <span></span> bar');

		expect(
			html(
				createElement(Trans, {
					id: 'unknown',
					message: 'foo <0>{0}</0> bar',
					values: {
						0: 'lol',
					},
					components: {
						0: createElement('span', null),
					},
				}),
			),
		).toEqual('foo <span>lol</span> bar');
	});

	it('should render default string', function defaultString() {
		expect(text(createElement(Trans, { id: 'unknown' }))).toEqual('unknown');

		expect(text(createElement(Trans, { id: 'unknown', message: 'Not translated yet' }))).toEqual(
			'Not translated yet',
		);

		expect(
			text(
				createElement(Trans, {
					id: 'unknown',
					message: 'Not translated yet, {name}',
					values: { name: 'Dave' },
				}),
			),
		).toEqual('Not translated yet, Dave');
	});

	it('should render translation', function renderTranslation() {
		const translation = text(
			createElement(Trans, {
				id: 'All human beings are born free and equal in dignity and rights.',
			}),
		);

		expect(translation).toEqual(
			'Všichni lidé rodí se svobodní a sobě rovní co do důstojnosti a práv.',
		);
	});

	it('should render translation from variable', function translationFromVariable() {
		const msg = 'All human beings are born free and equal in dignity and rights.';
		const translation = text(createElement(Trans, { id: msg }));
		expect(translation).toEqual(
			'Všichni lidé rodí se svobodní a sobě rovní co do důstojnosti a práv.',
		);
	});

	it('should render component in variables', function componentInVariables() {
		const translation = html(
			createElement(Trans, {
				id: 'Hello {name}',
				values: { name: createElement('strong', null, 'John') },
			}),
		);
		expect(translation).toEqual('Hello <strong>John</strong>');
	});

	it('should render array of components in variables', function arrayInVariables() {
		const translation = html(
			createElement(Trans, {
				id: 'Hello {name}',
				values: {
					name: [
						createElement('strong', { key: '1' }, 'John'),
						createElement('strong', { key: '2' }, '!'),
					],
				},
			}),
		);
		expect(translation).toEqual('Hello <strong>John</strong><strong>!</strong>');
	});

	it('should render named component in components', function namedComponent() {
		const translation = html(
			createElement(Trans, {
				id: 'Read <named>the docs</named>',
				components: { named: createElement('a', { href: '/docs' }) },
			}),
		);
		expect(translation).toEqual('Read <a href="/docs">the docs</a>');
	});

	it('should render nested named components in components', function nestedNamed() {
		const translation = html(
			createElement(Trans, {
				id: 'Read <link>the <strong>docs</strong></link>',
				components: {
					link: createElement('a', { href: '/docs' }),
					strong: createElement('strong'),
				},
			}),
		);
		expect(translation).toEqual('Read <a href="/docs">the <strong>docs</strong></a>');
	});

	it('should render components and array components with variable', function mixedComponents() {
		const translation = html(
			createElement(Trans, {
				id: 'Read <link>the <strong>docs</strong></link>, {name}',
				components: {
					link: createElement('a', { href: '/docs' }),
					strong: createElement('strong'),
				},
				values: {
					name: [
						createElement('strong', { key: '1' }, 'John'),
						createElement('strong', { key: '2' }, '!'),
					],
				},
			}),
		);
		expect(translation).toEqual(
			'Read <a href="/docs">the <strong>docs</strong></a>, <strong>John</strong><strong>!</strong>',
		);
	});

	it('should render non-named component in components', function numberedComponent() {
		const translation = html(
			createElement(Trans, {
				id: 'Read <0>the docs</0>',
				components: { 0: createElement('a', { href: '/docs' }) },
			}),
		);
		expect(translation).toEqual('Read <a href="/docs">the docs</a>');
	});

	it('should render nested elements with `asChild` pattern', function asChildPattern() {
		function ComponentThatExpectsSingleElementChild(props: {
			asChild: boolean;
			children?: OctaneNode;
		}) {
			if (props.asChild && isValidElement(props.children)) {
				return props.children;
			}

			return createElement('div', null);
		}

		const translation = html(
			createElement(Trans, {
				id: 'please <0><1>sign in again</1></0>',
				components: {
					0: createElement(ComponentThatExpectsSingleElementChild, { asChild: true }),
					1: createElement('a', { href: '/login' }),
				},
			}),
		);
		expect(translation).toEqual('please <a href="/login">sign in again</a>');
	});

	it('should render translation inside custom component', function customComponent() {
		function Component(props: { children?: OctaneNode }) {
			return createElement('p', { className: 'lead' }, props.children);
		}
		const html1 = html(createElement(Trans, { component: Component, id: 'Original' }));
		const html2 = html(
			createElement(Trans, {
				render: function renderLead(props: TransRenderProps) {
					return createElement('p', { className: 'lead' }, props.translation);
				},
				id: 'Original',
			}),
		);

		expect(html1).toEqual('<p class="lead">Původní</p>');
		expect(html2).toEqual('<p class="lead">Původní</p>');
	});

	it('should render custom format', function customFormat() {
		const translation = text(
			createElement(Trans, {
				id: 'msg.currency',
				message: '{value, number, currency}',
				values: { value: 1 },
				formats: {
					currency: {
						style: 'currency',
						currency: 'EUR',
						minimumFractionDigits: 2,
					},
				},
			}),
		);
		expect(translation).toEqual('1,00 €');
	});

	it('should render plural', function plural() {
		function renderCount(count: number) {
			return html(
				createElement(Trans, {
					id: 'tYX0sm',
					message: '{count, plural, =0 {Zero items} one {# item} other {# <0>A lot of them</0>}}',
					values: {
						count,
					},
					components: {
						0: createElement('a', { href: '/more' }),
					},
				}),
			);
		}

		expect(renderCount(0)).toEqual('Zero items');
		expect(renderCount(1)).toEqual('1 item');
		expect(renderCount(2)).toEqual('2 <a href="/more">A lot of them</a>');
	});

	describe('rendering', function renderingSuite() {
		it('should render a text node with no wrapper element', function textNode() {
			const txt = html(createElement(Trans, { id: 'Some text' }));
			expect(txt).toEqual('Some text');
		});

		it('should render custom element', function customElement() {
			const element = html(
				createElement(Trans, {
					render: function renderHeadline(props: TransRenderProps) {
						return createElement('h1', { id: props.id }, props.translation);
					},
					id: 'Headline',
				}),
			);
			expect(element).toEqual('<h1 id="Headline">Headline</h1>');
		});

		it('supports render callback function', function renderCallback() {
			const spy = vi.fn();
			text(
				createElement(Trans, {
					id: 'ID',
					message: 'Default',
					render: function renderSpy(props: TransRenderProps) {
						spy(props);
						return createElement(Fragment, null);
					},
				}),
			);

			expect(spy).toHaveBeenCalledWith({
				id: 'ID',
				message: 'Default',
				translation: 'Translation',
				children: 'Translation',
			});
		});

		it('should take defaultComponent prop with a custom component', function defaultComponent() {
			const span = render(
				createElement(
					I18nProvider,
					{ i18n, defaultComponent: DefaultComponentFC },
					createElement(Trans, { id: 'Some text' }),
				),
			).container.innerHTML;
			expect(span).toEqual('<div>Some text</div>');
		});

		it('should ignore defaultComponent when `component` or `render` is null', function ignoreDefault() {
			const cases: TransRenderCallbackOrComponent[] = [{ component: null }, { render: null }];
			for (let i = 0; i < cases.length; i++) {
				const props = cases[i]!;
				const translation = render(
					createElement(
						I18nProvider,
						{ i18n, defaultComponent: DefaultComponentFC },
						createElement(Trans, { id: 'Some text', ...props }),
					),
				).container.innerHTML;
				expect(translation).toEqual('Some text');
			}
		});
	});

	describe('component prop rendering', function componentPropSuite() {
		it('should render class component as simple prop', function classComponent() {
			// OCTANE DIVERGENCE: Octane has no class components. The upstream case
			// used `class ClassComponent extends React.Component`; a function
			// component with the same output pins the `component` prop contract.
			function ClassComponent() {
				return createElement('div', null, 'Headline');
			}
			const element = html(createElement(Trans, { component: ClassComponent, id: 'Headline' }));
			expect(element).toEqual('<div>Headline</div>');
		});

		it('should render function component as simple prop', function functionComponent() {
			const propsSpy = vi.fn();
			function Wrapped(props: TransRenderProps) {
				propsSpy(props);
				return createElement(ComponentFC, props);
			}

			const element = html(createElement(Trans, { component: Wrapped, id: 'Headline' }));
			expect(element).toEqual('<div id="Headline">value</div>');
			expect(propsSpy).toHaveBeenCalledWith({
				id: 'Headline',
				message: undefined,
				translation: 'Headline',
				children: 'Headline',
			});
		});
	});

	describe('I18nProvider defaultComponent accepts render-like props', function defaultRenderProps() {
		it('should render defaultComponent with Trans props', function defaultWithTransProps() {
			const markup = render(
				createElement(
					I18nProvider,
					{ i18n, defaultComponent: DefaultComponent },
					createElement(Trans, { id: 'ID', message: 'Some message' }),
				),
			);

			expect(markup.queryByTestId('id')?.innerHTML).toEqual('ID');
			expect(markup.queryByTestId('message')?.innerHTML).toEqual('Some message');
			expect(markup.queryByTestId('translation')?.innerHTML).toEqual('Translation');
		});

		describe('TransNoContext', function transNoContextSuite() {
			it('Should render without provider/context', function withoutProvider() {
				const translation = render(
					createElement(TransNoContext, {
						id: 'All human beings are born free and equal in dignity and rights.',
						lingui: { i18n: i18n },
					}),
				).container.textContent;

				expect(translation).toEqual(
					'Všichni lidé rodí se svobodní a sobě rovní co do důstojnosti a práv.',
				);
			});
		});
	});
});
