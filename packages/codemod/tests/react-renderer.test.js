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
it('retains the renderer diagnostic for callbacks with other behavior or opaque values', () => {
	for (const [props, before] of [
		['render={value => <b>{value}</b>}'],
		['values={{ bold: (x) => <b>{outside}</b> }}'],
		['values={{ bold: (x) => <Other>{x}</Other> }}'],
		['values={{ bold: (x) => <b>{...x}</b> }}'],
		['values={{ bold: (x) => <b ref={target}>{x}</b> }}'],
		['values={{ bold: (x) => <b onClick={f}>{x}</b> }}'],
		['values={{ bold: (x) => <b>{format(x)}</b> }}'],
		['values={{ bold: (x) => <b title="&amp;">{x}</b> }}'],
		['values={{ bold: (x) => <b {...props}>{x}</b> }}'],
		['values={{ bold: (x) => <b>{x}</b>, other: opaque }}', 'declare const opaque: unknown;'],
		['values={{ ...extra, bold: (x) => <b>{x}</b> }}'],
		['values={{ bold: renderer }}', 'const renderer=(x)=><b>{x}</b>;'],
		['values={{ bold: (jsx) => <b>{jsx}</b> }}'],
	])
		expect(
			migrate(props, before).notes.some((n) => n.severity === 'error'),
			props,
		).toBe(true);
});
