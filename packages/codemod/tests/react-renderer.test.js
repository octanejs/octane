import { expect, it } from 'vitest';
import { transformModule } from '../dist/index.js';

const migrate = (props, before = '') =>
	transformModule(
		"import { Display } from 'example-ui';\n" +
			before +
			'\nexport function Page() { return <Display ' +
			props +
			' />; }',
		'page.tsx',
		{ reactCompat: true, unported: (module) => (module === 'example-ui' ? module : null) },
	);
it('keeps closed intrinsic callbacks owned by the receiving React island', () => {
	const result = migrate(
		'values={{ number: 2, strong: value => <strong className="accent">{value}</strong>, newline: () => <br /> }}',
	);
	expect(result.notes.filter((n) => n.severity === 'error')).toEqual([]);
	expect(result.code).toContain("from 'react/jsx-runtime'");
	expect(result.code).toContain('<ReactCompat>');
});
it('passes boolean and nullish options beside a React-owned callback', () => {
	const result = migrate(
		'values={{ enabled: true, disabled: (false), empty: null, absent: (undefined), strong: value => <b>{value}</b> }}',
	);
	expect(result.notes.filter((note) => note.severity === 'error')).toEqual([]);
	expect(result.code).toContain('<ReactCompat>');
});
it('retains the renderer diagnostic for callbacks with other behavior or opaque values', () => {
	for (const [props, before] of [
		['render={value => <b>{value}</b>}'],
		['values={{ bold: value => <b> {value} </b> }}'],
		['values={{ bold: value => <b key={value}>{value}</b> }}'],
		['values={{ bold: (x) => <b>{outside}</b> }}'],
		['values={{ bold: (x) => <Other>{x}</Other> }}'],
		['values={{ bold: (x) => <b>{...x}</b> }}'],
		['values={{ bold: (x) => <b ref={target}>{x}</b> }}'],
		['values={{ bold: (x) => <b onClick={f}>{x}</b> }}'],
		['values={{ bold: (x) => <b>{format(x)}</b> }}'],
		['values={{ bold: (x) => <b title="&amp;">{x}</b> }}'],
		['values={{ bold: (x) => <b {...props}>{x}</b> }}'],
		['values={{ bold: (x) => <b>{x}</b>, other: opaque }}', 'declare const opaque: unknown;'],
		['values={{ bold: (x) => <b>{x}</b>, other: undefined }}', 'declare const undefined: unknown;'],
		[
			'values={{ bold: (x) => <b>{x}</b>, other: opaque as boolean }}',
			'declare const opaque: unknown;',
		],
		['values={{ ...extra, bold: (x) => <b>{x}</b> }}'],
		['values={{ bold: renderer }}', 'const renderer=(x)=><b>{x}</b>;'],
		['values={{ bold: (jsx) => <b>{jsx}</b> }}'],
	])
		expect(
			migrate(props, before).notes.some((n) => n.severity === 'error'),
			props,
		).toBe(true);
});

it.each([
	['const {part} = {part: <b/> as unknown as string};', 'part'],
	['const parts = {label:<b/> as unknown as string};', 'parts.label'],
	['const label = () => <b/> as unknown as string;', 'label()'],
	['declare function format(el: import("react").ReactElement): string;', 'format(<b/>)'],
])(
	'keeps renderer diagnostics for scalar-looking substitutions that evaluate JSX: %s',
	(setup, value) => {
		const result = transformModule(
			"import {FormattedMessage} from 'react-intl';\n" +
				setup +
				'\nexport function Page(){return <FormattedMessage id="value" values={{text:' +
				value +
				'}}/>;}',
			'page.tsx',
			{
				reactCompat: true,
				reactIntlAdapter: './intl.tsrx',
				unported: (name) => (name === 'react-intl' ? name : null),
			},
		);
		expect(result.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	},
);

it('retains the hook diagnostic when producing a placeholder substitution requires React JSX', () => {
	const result = transformModule(
		`import {useIntl} from 'react-intl';
		declare function text(node: import('react').ReactElement): string;
		export function Field() { const intl = useIntl(); return <input placeholder={intl.formatMessage({id:'hint'}, {label: text(<b/>)})} />; }`,
		'field.tsx',
		{
			reactIntlAdapter: './intl.tsrx',
			reactCompat: true,
			unported: (name) => (name === 'react-intl' ? name : null),
		},
	);
	expect(result.notes).toContainEqual(
		expect.objectContaining({ rule: 'bindings', severity: 'error' }),
	);
});
