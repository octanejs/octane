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

it.each([
	['of [<b/> as unknown as string]', true],
	['of ["label"]', false],
	['in {label:<b/>}', false],
])('checks the value supplied to a React component by a loop %s', (source, blocked) => {
	const result = transformModule(
		`import {Display} from 'example-ui';
		export function Page() { for (const label ${source}) return <Display text={label}/>; return null; }`,
		'page.tsx',
		{ reactCompat: true, unported: (name) => (name === 'example-ui' ? name : null) },
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it.each([
	['const label = <b/> as unknown as string;', true],
	['let label = ""; label = <b/> as unknown as string;', true],
	['let label = ""; const next = <b/> as unknown as string; label = next;', true],
	['let label = ""; label ||= <b/> as unknown as string;', true],
	['let label = ""; (label satisfies string) = <b/> as unknown as string;', true],
	['let label = ""; for (label of [<b/> as unknown as string]) {}', true],
	['let label = ""; for ({label = <b/> as unknown as string} in {key: 1}) {}', true],
	['let label = ""; [label] = [<b/> as unknown as string];', true],
	['let label = ""; [label = <b/> as unknown as string] = [];', true],
	['let labels = []; [...labels] = [<b/> as unknown as string]; const label = labels[0];', true],
	['let label = ""; ({text: label} = {text: <b/> as unknown as string});', true],
	['let label = ""; ({label = <b/> as unknown as string} = {});', true],
	['let label = ""; for ([label] of [[<b/> as unknown as string]]) {}', true],
	['let label = ""; label = "updated";', false],
	['let label = ""; label ||= "updated";', false],
	['let label = ""; for (label of ["updated"]) {}', false],
	['let label = ""; [label] = ["updated"];', false],
	['let label = ""; ({text: label} = {text: "updated"});', false],
	['let label = ""; for (label in {text: <b/>}) {}', false],
	['let label = ""; let next = ""; label = next; next = label;', false],
	['let label = ""; const values = {}; values[label] = <b/>;', false],
	['let label = ""; let unused; ({[label]: unused} = {text: <b/>});', false],
	['let label = ""; { let label = ""; label = <b/> as unknown as string; }', false],
])('checks reassigned React island props: %s', (setup, blocked) => {
	const result = transformModule(
		`import {Display} from 'example-ui';
		export function Page() { ${setup} return <Display label={label}/>; }`,
		'page.tsx',
		{ reactCompat: true, unported: (name) => (name === 'example-ui' ? name : null) },
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it.each([
	['model.label = element;', 'model.label', true],
	['model.label = element; const label = model.label;', 'label', true],
	["const alias = model; alias['label'] = element;", 'model.label', true],
	['const alias = model; model.label = element;', 'alias.label', true],
	['model.label = element;', 'model', true],
	['model.label = element;', 'model.icon', false],
	['model.label = element; const alias = model;', 'alias.icon', false],
	['model.label = "updated";', 'model.label', false],
	['const other: Model = {label: "", icon: ""}; other.label = element;', 'model.label', false],
	['const key = Math.random() ? "label" : "icon"; model[key] = element;', 'model.label', true],
	['model.label = element; const key = Math.random() ? "label" : "icon";', 'model[key]', true],
	['const box = {left: model, right: model}; box.left.label = element;', 'box.left', true],
	['let alias; alias = model; alias.label = element;', 'model.label', true],
	[
		'const box = { model }; const { model: alias } = box; alias.label = element;',
		'box.model.label',
		true,
	],
	['const { missing: alias = model } = {}; alias.label = element;', 'model.label', true],
	['const pick = Math.random() ? model : {label: ""}; pick.label = element;', 'model.label', true],
	['model.icon = element; const {label: title} = model;', 'title', false],
	['const key = "icon"; model[key] = element;', 'model.label', false],
	['const {...copy} = model; copy.label = element;', 'model.label', false],
	['const rows = ["", ""]; const [,...copy] = rows; copy[0] = element;', 'rows[1]', false],
	[
		'const rows = [{}, model]; const [,...copy] = rows; copy[0].label = element;',
		'rows[1].label',
		true,
	],
	['const box = {row: model}; box.row = {label: "safe", icon: element};', 'box.row.label', false],
	['const box = {row: model}; box.row = {label: element, icon: "safe"};', 'box.row.label', true],
	[
		'const box = {row: model}; ({item:box.row} = {item:{label:element}, label:"decoy"});',
		'box.row.label',
		true,
	],
	[
		'const box = {row: model}; ({item:box.row} = {item:{label:"safe"}, label:element});',
		'box.row.label',
		false,
	],
	['const box = {row:model}; let a; ({row:a}=box); a.label=element;', 'box.row.label', true],
	['const box = {row:model}; let a; ({row:a}=box); a.label=element;', 'box.row.icon', false],
	['let a; ({row:a}={row:model}); a.label=element;', 'model.label', true],
	['let a; ({row:a}={row:model}); a.label=element;', 'model.icon', false],
	[
		'const rows=[{},model]; let rest; [,...rest]=rows; rest[0].label=element;',
		'rows[1].label',
		true,
	],
	[
		'const rows=[{label:""},model]; let rest; [,...rest]=rows; rest[0].label=element;',
		'rows[0].label',
		false,
	],
	['let rest; ({...rest}=model); rest.label=element;', 'model.label', false],
	['const rows=[{row:model}]; let a; for ({row:a} of rows) a.label=element;', 'model.label', true],
	[
		'const rows=[{row:model}]; for (const {row:a} of rows) a.label=element;',
		'rows[0].row.label',
		true,
	],
	[
		'const source={left:model,right:{label:""}}; const key=Math.random()?"left":"right"; let a; ({[key]:a}=source); a.label=element;',
		'model.label',
		true,
	],
	['const box={row:model}; box.row={label:element,icon:""};', 'model.label', false],
	['function update(a=model) { a.label=element; } update();', 'model.label', true],
	[
		'const box={row:model}; function update({row:a}=box){ a.label=element; } update();',
		'model.label',
		true,
	],
	['const pick = Math.random() > 0.5 && model; if (pick) pick.label=element;', 'model.label', true],
	['for (model.label of [element]) {}', 'model.label', true],
])('checks property writes before passing %s %s to React', (setup, value, blocked) => {
	const result = migrate(
		`value={${value}}`,
		`
		type Model = { label: string, icon: string };
		const model: Model = {label: "", icon: ""};
		const element = <b/> as unknown as string;
		${setup}`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it('checks deeply branching receiver aliases while preserving independent fields', () => {
	const depth = 24;
	const aliases = Array.from(
		{ length: depth },
		(_, i) => `const row${i + 1} = flag ? row${i}.left : row${i}.right;`,
	).join('\n');
	const setup = `declare const flag: boolean, row0: any; ${aliases} row${depth}.label = <b/>;`;
	const path = 'row0' + '.right'.repeat(depth) + '.label';
	expect(migrate(`value={${path}}`, setup).notes).toContainEqual(
		expect.objectContaining({ rule: 'bindings', severity: 'error' }),
	);
	expect(migrate('value={row0.other}', setup).rules['react-compat']).toBe(1);
});

it.each([
	['const row: Data = {label: read(), icon: ""};', 'label', true],
	['const row = {label: read(), icon: ""} as Data;', 'label', true],
	['const row = {label: read(), icon: ""} satisfies Data;', 'label', true],
	['const row: Data = {label: read(), icon: ""};', 'icon', false],
])('preserves the declared type of a destructured field: %s %s', (source, field, blocked) => {
	const result = migrate(
		'value={model.value}',
		`import type { ReactNode } from 'react';
		type Data = {label: ReactNode, icon: string};
		declare function read(): any;
		const model = {value: ""}; ${source}
		({${field}: model.value} = row as {label: string, icon: string});`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it.each([
	['row.icon = element; ({label: model.label} = row);', 'model.label', false],
	[
		'const values = ["safe", element]; const holder = {values, get swap(){this.values.reverse(); return 0}}; const swap = holder.swap; [model.label] = values;',
		'model.label',
		true,
	],
	[
		'const values = ["safe", element]; eval("values.reverse()"); [model.label] = values;',
		'model.label',
		true,
	],
	[
		'const data = {label: "safe", icon: element}; Object.defineProperty(data, "label", {get(){return this.icon}}); ({value: model.label} = {value: data.label});',
		'model.label',
		true,
	],
	[
		'const box = {row}; row.icon = element; ({label: model.label} = box.row);',
		'model.label',
		false,
	],
	[
		'const box = {row}; row.label = element; ({label: model.label} = box.row);',
		'model.label',
		true,
	],
	[
		'const data = {label: "safe", icon: element}; ({text: model.label} = {text: data.label, icon: data.icon});',
		'model.label',
		false,
	],
	[
		'const data = {label: "safe", icon: element}; ({text: model.label} = {text: data.icon});',
		'model.label',
		true,
	],
	[
		'const values = ["safe", ""]; values[1] = element; [model.label] = values;',
		'model.label',
		false,
	],
	[
		'const values = ["safe", ""]; values[1] = element; [,model.label] = values;',
		'model.label',
		true,
	],
	[
		'const values = ["safe", element]; values.reverse(); [model.label] = values;',
		'model.label',
		true,
	],
	[
		'const values = ["safe", element]; values[Symbol.iterator] = function*(){yield this[1]}; [model.label] = values;',
		'model.label',
		true,
	],
	['row.icon = element; ({missing: model.label = "safe"} = row);', 'model.label', false],
	['row.missing = element; ({missing: model.label = "safe"} = row);', 'model.label', true],
	['row.icon = element; ({missing: model.label = element} = row);', 'model.label', true],
	[
		'const data = {__proto__: {missing: element}, icon: element}; ({missing: model.label = "safe"} = data);',
		'model.label',
		true,
	],
	[
		'const data = {icon: element}; Object.setPrototypeOf(data, {missing: element}); ({missing: model.label = "safe"} = data);',
		'model.label',
		true,
	],
	['row.label = element; ({label: model.label} = row);', 'model.label', true],
	['const alias = row; row.icon = element; ({label: model.label} = alias);', 'model.label', false],
	['const alias = row; alias.label = element; ({label: model.label} = row);', 'model.label', true],
	['const {label} = {label: "safe", icon: element};', 'label', false],
	['const nested = {row}; row.label = element; const {row: {label}} = nested;', 'label', true],
	['let label; ({label} = {label: "safe", icon: element});', 'label', false],
	['let {label} = row; label = element;', 'label', true],
	['const {label = element} = {};', 'label', true],
	[
		'row.icon = element; ({label: model.label, icon: model.icon} = row);',
		'[model.label, model.icon]',
		true,
	],
	[
		'const key = Math.random() ? "icon" : "label"; row[key] = element; ({label: model.label} = row);',
		'model.label',
		true,
	],
	['const {label} = {get label() {return element;}, icon: "safe"};', 'label', true],
])('checks only the field supplied by destructuring: %s', (setup, value, blocked) => {
	const result = migrate(
		`value={${value}}`,
		`const element = <b/> as unknown as string;
		const row = {label: "safe", icon: ""}, model = {label: "", icon: ""}; ${setup}`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it.each([
	['function write(row) { row.label = element; } write(model);', 'model.label', true],
	['const write = row => { row.label = "safe"; }; write(model);', 'model.label', false],
	['const write = row => { row.label = element; }; write(other);', 'model.label', false],
	['const write = row => { row.icon = element; }; write(model);', 'model.label', false],
	[
		'function put(row, value) { row.label=value; } put(model,"safe"); put(other,element);',
		'model.label',
		false,
	],
	[
		'function put(row, value) { row.label=value; } put(model,"safe"); put(other,element);',
		'other.label',
		true,
	],
	['function put(value) { model.label=value; } put(element);', 'model.label', true],
	['const get=()=>model; get().label=element;', 'model.label', true],
	['function id(row){return row;} id(model).label=element;', 'other.label', false],
	['function id(row){return row;} id(model).label=element;', 'model.label', true],
	['function id(row){return row;} model.icon=element;', 'id(model).label', false],
	[
		'function put(row,v){row.label=v;} function apply(row,v){put(row,v);} apply(model,"safe");apply(other,element);',
		'model.label',
		false,
	],
	[
		'function put(row,v){row.label=v;} function apply(row,v){put(row,v);} apply(model,"safe");apply(other,element);',
		'other.label',
		true,
	],
	[
		'function put(m,v){const scratch={s:""}; scratch.s=v; m.label=scratch.s;} put(model,element);put(other,"safe");',
		'model.label',
		true,
	],
	[
		'function put(m,v){const scratch={s:""}; scratch.s=v; m.label=scratch.s;} put(model,element);put(other,"safe");',
		'other.label',
		false,
	],
	[
		'function set(v){model.label=v;} const forward=x=>set(x); forward(element);',
		'model.label',
		true,
	],
	['function put(m=model){m.label=element;} put(other);', 'model.label', false],
	['function put(m=model){m.label=element;} put();', 'model.label', true],
	[
		'function put(m,row){m.label=row.label;} put(model,{label:"ok",icon:element});',
		'model.label',
		false,
	],
	['function put(m,{label:v}){m.label=v;} put(model,{label:element});', 'model.label', true],
	['function put(m,...args){m.label=args[0];} put(model,element);', 'model.label', true],
	[
		'function put(m,v){const scratch={s:""};scratch.s=v;m.label=scratch.s;} function send(m,v){put(m,v);} send(model,element);send(other,"");',
		'model.label',
		true,
	],
	[
		'function put(m,v){const scratch={s:""};scratch.s=v;m.label=scratch.s;} function send(m,v){put(m,v);} send(model,element);send(other,"");',
		'other.label',
		false,
	],
	[
		'function make(){const fresh={label:""};return fresh} const a=make(),b=make(); b.label=element;',
		'a.label',
		false,
	],
	[
		'function use(a,b,v){a.label=v;} const args=[model,""]; use(...args,element);',
		'model.label',
		true,
	],
	['function use(a,b,v){a.label=v;} use(...[model,""],element);', 'model.label', true],
	...['as typeof put', 'satisfies typeof put', '!'].flatMap((wrapper) => [
		[`function put(row){row.label=element;} (put ${wrapper})(model);`, 'model.label', true],
		[
			`const put = (row) => {row.label=element;}; const alias = put ${wrapper}; alias(other);`,
			'other.label',
			true,
		],
		[
			`const put = (row) => {row.label=element;}; const alias = put ${wrapper}; alias(other);`,
			'model.label',
			false,
		],
	]),
	...['as typeof row', 'satisfies typeof row', '!'].flatMap((wrapper) => [
		[`function id(row){return (row ${wrapper});} model.icon=element;`, 'id(model).label', false],
		[`function id(row){return (row ${wrapper});} model.icon=element;`, 'id(model).icon', true],
	]),
])('follows writes through local calls: %s', (setup, value, blocked) => {
	const result = migrate(
		`value={${value}}`,
		`
		const model={label:"",icon:""},other={label:"",icon:""};
		const element=<b/> as unknown as string;
		${setup}`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it('keeps the diagnostic when many nested helper invocations can carry JSX', () => {
	const wrappers = Array.from(
		{ length: 18 },
		(_, i) => `function set${i + 1}(row,v){set${i}(row,v);set${i}(row,v);}`,
	).join('\n');
	const setup = `const model={label:"",icon:""}; function set0(row,v){row.label=v;} ${wrappers}
		set18(model,<b/> as unknown as string);`;
	expect(migrate('value={model.label}', setup).notes).toContainEqual(
		expect.objectContaining({ rule: 'bindings', severity: 'error' }),
	);
	expect(migrate('value={model.icon}', setup).rules['react-compat']).toBe(1);
});

it('checks values assigned by an async iterator before they cross into React', () => {
	const result = transformModule(
		`import { Display } from 'example-ui';
		let label = "";
		export async function update() { for await (label of [<b/> as unknown as string]) {} }
		export function Page() { return <Display label={label}/>; }`,
		'page.tsx',
		{ reactCompat: true, unported: (name) => (name === 'example-ui' ? name : null) },
	);
	expect(result.notes).toContainEqual(
		expect.objectContaining({ rule: 'bindings', severity: 'error' }),
	);
	expect(result.rules['react-compat'] ?? 0).toBe(0);
});

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

it.each([
	' <Message id="x" />',
	'\t<Message id="x" />',
	'\u00a0<Message id="x" />',
	'{" "}<Message id="x" />',
	'{ok && <Message id="x" />}',
	'{ok ? <Message id="x" /> : null}',
	'{ids.map(id => <Message id={id} />)}',
	'<Message id="x" /><Message id="y" />',
	'<Card render={() => <Message id="x" />} />',
	'{ok ? <Message id="x" /> : <Local />} ',
	'{ok ? <Message id="x" /> : <React.Fragment />}',
])(
	'keeps the original binding and diagnoses unsupported authored island children: %s',
	(children) => {
		const result = transformModule(
			"import {ReactCompat as Bridge} from 'octane/react'; import {FormattedMessage as Message} from 'react-intl';\n" +
				'export function Page({ok,ids}) { return <Bridge>' +
				children +
				'</Bridge>; }',
			'page.tsx',
			{
				reactCompat: true,
				reactIntlAdapter: './intl.tsrx',
				unported: (name) => (name === 'react-intl' ? name : null),
			},
		);
		expect(result.code).toContain("from 'react-intl'");
		expect(result.notes).toContainEqual(
			expect.objectContaining({
				rule: 'bindings',
				severity: 'error',
				message: expect.stringContaining('one component child'),
			}),
		);
		expect(result.code).not.toContain('<IntlBoundary');
	},
);

it('checks JSX-valued props on the original React child of an authored island', () => {
	const result = transformModule(
		"import {ReactCompat as Bridge} from 'octane/react'; import {FormattedMessage as Message} from 'react-intl'; export function Page(){return <Bridge><Message id='x' values={{x:<b/>}} /></Bridge>}",
		'page.tsx',
		{
			reactCompat: true,
			reactIntlAdapter: './intl.tsrx',
			unported: (name) => (name === 'react-intl' ? name : null),
		},
	);
	expect(result.notes).toContainEqual(
		expect.objectContaining({
			rule: 'bindings',
			severity: 'error',
			message: expect.stringContaining('props or children'),
		}),
	);
});

it.each([
	...['||', '??', '&&'].flatMap((operator) => [
		[`const pick = model ${operator} other;`, 'pick.label', false],
		[`const pick = other ${operator} model;`, 'pick.label', false],
		[`const pick = model ${operator} model;`, 'pick.icon', true],
		[`const pick = consume(model) ${operator} other;`, 'pick.label', true],
	]),
	['const pick = choose ? model : other;', 'pick.label', false],
	['const {missing: pick = model} = {};', 'pick.label', false],
	['const {missing: pick = choose ? (model) : other} = {};', 'pick.label', false],
	['let pick; ({missing: pick = model} = {});', 'pick.label', false],
	['let pick; ({pick = model} = {});', 'pick.label', false],
	['let pick; [[pick = model]] = [[]];', 'pick.label', false],
	['let pick; ({pick = model} = {});', 'pick', true],
	['const pick = {row: other}; ({value: pick.row = model} = {});', 'pick.row.icon', true],
	['const box = {row: model};', 'box.row.label', false],
	['const box = {model};', 'box', true],
	['const box = [other, {model}];', 'box[1].model.icon', true],
	['const box = [other, {model}];', 'box[1].model.label', false],
	['', '{row: model}', true],
	['const pick = choose ? model : other;', 'pick.icon', true],
	['const {missing: pick = model} = {};', 'pick.icon', true],
	['const pick = model.icon ? other : model;', 'pick.label', true],
	['const pick = choose ? consume(model) : other;', 'pick.label', true],
])('checks the selected field of an alias from %s', (setup, read, blocked) => {
	const result = migrate(
		`label={${read}}`,
		`
		const choose = Math.random() > 0.5;
		const model = {label: '', icon: ''};
		const other = {label: '', icon: ''};
		declare function consume(value: typeof model): typeof model;
		model.icon = <b/> as unknown as string;
		${setup}`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it.each([
	['Object.assign(model, {label: element});', 'model.label', true],
	['Object.assign(model, {icon: element});', 'model.label', false],
	['Object.assign(model, {label: "scalar"});', 'model.label', false],
	['Object.assign(other, {label: element});', 'model.label', false],
	['Object.assign(model, {icon: ""}, {label: element});', 'model.label', true],
	['const label = element; Object.assign(model, {label});', 'model.label', true],
	['Object.assign(model, {["label"]: element});', 'model.label', true],
	['Object["assign"](model, {get label() { return element; }});', 'model.label', true],
	['Object.assign(model, {...({icon: element} as const)});', 'model.label', false],
	['Object.assign(model, {...{row: {name: element}, name: "decoy"}});', 'model.row.name', true],
	['const source = {label: element}; Object.assign(model, source);', 'model.label', true],
	['const source = {label: element}; Object.assign(model, {...source});', 'model.label', true],
	[
		'const source = {label: ""}; source.label = element; Object.assign(model, source);',
		'model.label',
		true,
	],
	['const alias = Object.assign(model, {}); alias.label = element;', 'model.label', true],
	['Object.assign({}, {row: model}).row.label = element;', 'model.label', true],
	['const copy = Object.assign({}, model); copy.label = element;', 'model.label', false],
	['const alias = Object.assign(model, {}); model.label = element;', 'alias.label', true],
	['const alias = Object.assign(model, {}); model.icon = element;', 'alias.label', false],
	[
		'const alias = Object.assign(model, {}); Object.assign(other, {label: element});',
		'alias.label',
		false,
	],
	[
		'const Object = {assign: (target, source) => source}; Object.assign(model, {label: element});',
		'model.label',
		false,
	],
	['(Object.assign as typeof Object.assign)(model, {label: element});', 'model.label', true],
	['(Object satisfies typeof Object).assign(model, {icon: element});', 'model.label', false],
	['(Object!).assign(model, {label: element});', 'model.label', true],
])('checks the selected field copied by Object.assign in %s', (setup, read, blocked) => {
	const result = migrate(
		`value={${read}}`,
		`const model = {label: "", icon: ""}; const other = {label: "", icon: ""};
		const element = <b/> as unknown as string; ${setup}`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});

it.each([
	['({label: model.label} = row); row.label = element;', false],
	['row.label = element; ({label: model.label} = row);', true],
	['const alias = row; ({label: model.label} = row); alias.label = element;', false],
	['({label: model.label} = row); const alias = model; alias.label = element;', true],
	['const {label} = row; row.label = element; model.label = label;', false],
	['for (let i=0; i<2; i++) { ({label: model.label} = row); row.label = element; }', true],
	['function save() { ({label: model.label} = row); row.label = element; } save(); save();', true],
	['const save = () => ({label: model.label} = row); row.label = element; save();', true],
	[
		'const box = {child: row}; ({child: model.copy} = box); row.label = element; model.label = model.copy.label;',
		true,
	],
])('preserves the captured field value across later writes in %s', (setup, blocked) => {
	const result = migrate(
		'value={model.label}',
		`
		const element = <b/> as unknown as string;
		const model = {label: ""}, row = {label: "safe"};
		${setup}
	`,
	);
	expect(result.notes.some((note) => note.rule === 'bindings' && note.severity === 'error')).toBe(
		blocked,
	);
	expect(result.rules['react-compat'] ?? 0).toBe(blocked ? 0 : 1);
});
