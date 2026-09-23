import { describe, expect, it, vi } from 'vitest';
import { createElement, flushSync, hydrateRoot, memo } from 'octane';
import * as Server from 'octane/server';
import * as Universal from 'octane/universal';
import { mount } from './_helpers';
import { TemplateHost, ValueHost } from './_fixtures/memo-props.tsrx';
import { loadServerFixture } from './_server-fixture';

const server = loadServerFixture('packages/octane/tests/_fixtures/memo-props.tsrx');
const names = ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__'] as const;
const transitions = names.flatMap((name) =>
	[false, true].flatMap((previousNull) =>
		[false, true].map((nextNull) => ({ name, previousNull, nextNull })),
	),
);

function propsWith(nullPrototype: boolean, values: Record<string, unknown>) {
	return Object.create(
		nullPrototype ? null : Object.prototype,
		Object.getOwnPropertyDescriptors(values),
	) as Record<string, unknown>;
}

describe.each([
	['template', TemplateHost, server.TemplateHost],
	['value', ValueHost, server.ValueHost],
] as const)('memo props in %s position', (_, Host, ServerHost) => {
	it.each(transitions)(
		'updates after replacing own $name (null prototypes: $previousNull → $nextNull)',
		({ name, previousNull, nextNull }) => {
			const previous = propsWith(previousNull, { [name]: Reflect.get(Object.prototype, name) });
			const next = propsWith(nextNull, { label: 'updated' });
			const r = mount(Host, { childProps: previous });
			try {
				expect(r.container.textContent).toBe('fallback');
				r.update(Host, { childProps: next });
				expect(r.container.textContent).toBe('updated');
				r.update(Host, { childProps: previous });
				expect(r.container.textContent).toBe('fallback');
			} finally {
				r.unmount();
			}
		},
	);

	it.each(transitions)(
		'updates hydrated output after replacing own $name (null prototypes: $previousNull → $nextNull)',
		({ name, previousNull, nextNull }) => {
			const previous = {
				childProps: propsWith(previousNull, { [name]: Reflect.get(Object.prototype, name) }),
			};
			const next = { childProps: propsWith(nextNull, { label: 'updated' }) };
			const container = document.createElement('div');
			container.innerHTML = Server.renderToString(ServerHost, previous).html;
			document.body.append(container);
			const output = container.querySelector('output');
			expect(output).not.toBeNull();
			const onRecoverableError = vi.fn();
			const root = hydrateRoot(container, Host, previous, { onRecoverableError });
			try {
				flushSync(() => {});
				expect(container.querySelector('output')).toBe(output);
				expect(container.textContent).toBe('fallback');
				flushSync(() => root.render(Host, next));
				expect(container.textContent).toBe('updated');
				expect(onRecoverableError).not.toHaveBeenCalled();
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);
});

describe('memo own prop membership', () => {
	it('distinguishes an explicit undefined prop from a missing prop', () => {
		const Presence = memo((props: Record<string, unknown>) =>
			createElement('output', null, Object.hasOwn(props, 'flag') ? 'present' : 'missing'),
		);
		const Host = (props: { childProps: Record<string, unknown> }) =>
			createElement(Presence, props.childProps);
		const r = mount(Host, { childProps: { flag: undefined } });
		try {
			expect(r.container.textContent).toBe('present');
			r.update(Host, { childProps: { other: undefined } });
			expect(r.container.textContent).toBe('missing');
		} finally {
			r.unmount();
		}
	});

	it.each(transitions)(
		'updates universal memo after replacing own $name (null prototypes: $previousNull → $nextNull)',
		({ name, previousNull, nextNull }) => {
			const plan = Universal.universalPlan('object', {
				kind: 'host',
				type: 'output',
				bindings: [['value', 0]],
			});
			const Label = Universal.memo(
				Universal.defineUniversalComponent('object', (props: Record<string, unknown>) =>
					Universal.universalValue(plan, [props.label ?? 'fallback']),
				),
			);
			const Host = Universal.defineUniversalComponent(
				'object',
				(props: { childProps: Record<string, unknown> }) =>
					Universal.universalComponent('object', Label, props.childProps),
			);
			const container = Universal.createObjectContainer();
			const root = Universal.createUniversalRoot(container, Universal.createObjectDriver());
			try {
				root.render(Host, {
					childProps: propsWith(previousNull, { [name]: Reflect.get(Object.prototype, name) }),
				});
				expect(container.children[0].props.value).toBe('fallback');
				root.render(Host, { childProps: propsWith(nextNull, { label: 'updated' }) });
				expect(container.children[0].props.value).toBe('updated');
			} finally {
				root.unmount();
			}
		},
	);

	it.each(transitions)(
		'renders current server memo props for own $name (null prototypes: $previousNull → $nextNull)',
		({ name, previousNull, nextNull }) => {
			const Label = Server.memo((props: Record<string, unknown>) =>
				Server.createElement('output', null, props.label ?? 'fallback'),
			);
			expect(
				Server.renderToStaticMarkup(
					Label,
					propsWith(previousNull, { [name]: Reflect.get(Object.prototype, name) }),
				).html,
			).toBe('<output>fallback</output>');
			expect(
				Server.renderToStaticMarkup(Label, propsWith(nextNull, { label: 'updated' })).html,
			).toBe('<output>updated</output>');
		},
	);
});
