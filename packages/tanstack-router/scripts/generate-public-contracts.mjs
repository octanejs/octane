import { createRequire } from 'node:module';
import { resolve, relative, dirname } from 'node:path';
import fs from 'node:fs';
import prettier from 'prettier';
const root = process.cwd(),
	ts = createRequire(resolve('package.json'))('typescript');
const { pinnedPublicEntries, pinnedPublicExport } = await import(
	'file://' + root + '/scripts/react-port/pinned-public-types.mjs'
);
const { createTypeEvidenceProgram } = await import(
	'file://' + root + '/scripts/react-port/type-program.mjs'
);
const manifestArgument = process.argv.indexOf('--manifest');
if (manifestArgument < 0 || !process.argv[manifestArgument + 1])
	throw Error('Pass --manifest with the external campaign manifest.');
const m = JSON.parse(fs.readFileSync(process.argv[manifestArgument + 1]));
const n = m.nodes['pkg:@tanstack/react-router'],
	dir = resolve(n.bindingDirectory),
	entries = pinnedPublicEntries(dir, n, { baseline: m.baseline });
const config = dir + '/tests/types/tsconfig.json',
	loaded = ts.readConfigFile(config, ts.sys.readFile),
	parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dir + '/tests/types');
const p = createTypeEvidenceProgram(
		[...parsed.fileNames.filter((f) => !f.endsWith('.tsrx')), ...entries.values()],
		parsed.options,
	),
	c = p.getTypeChecker();
const resolveAlias = (s) => (s?.flags & ts.SymbolFlags.Alias ? c.getAliasedSymbol(s) : s);
const records = [];
const imports = [];
let entryIndex = 0;
for (const [subpath, value] of Object.entries(
	JSON.parse(fs.readFileSync(dir + '/package.json')).exports,
)) {
	if (subpath === './package.json') continue;
	const spec = subpath === '.' ? n.binding : n.binding + subpath.slice(1),
		entry = resolve(dir, value.types ?? value),
		alias = 'Actual' + entryIndex++;
	imports.push(`import type * as ${alias} from '${spec}';`);
	const module = c.getSymbolAtLocation(p.getSourceFile(entry));
	for (const exp of c.getExportsOfModule(module)) {
		const witness = pinnedPublicExport(entries, p, c, spec, exp.name);
		if (!witness) throw Error('No witness ' + exp.name);
		const symbol = resolveAlias(witness);
		const decl =
			symbol.declarations?.find((d) => d.typeParameters?.length) ?? symbol.declarations?.[0];
		const witnessPath = entries.get(spec + '#prior-binding');
		const primaryModule = c.getSymbolAtLocation(p.getSourceFile(entries.get(spec)));
		const primaryExport = c.getExportsOfModule(primaryModule).find((e) => e.name === exp.name);
		const isPrior =
			!primaryExport ||
			symbol.declarations?.some((d) => d.getSourceFile().fileName.includes('/previous-binding/'));
		const file = isPrior ? (witnessPath ?? entries.get(spec)) : entries.get(spec);
		const witnessImport = relative(dir + '/typetests', file).replaceAll('\\', '/');
		let reference = `import(${JSON.stringify(witnessImport.startsWith('.') ? witnessImport : './' + witnessImport)}).${exp.name}`;
		if (exp.name === 'BlockerResolver')
			reference = "ReturnType<typeof import('@tanstack/react-router').useBlocker>";
		if (exp.name === 'ShouldBlockFnArgs')
			reference = "Parameters<import('@tanstack/react-router').ShouldBlockFn>[0]";
		const actual = alias + '.' + exp.name;
		const type =
			symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)
				? c.getDeclaredTypeOfSymbol(symbol)
				: c.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? decl);
		const valueSymbol = Boolean(symbol.flags & ts.SymbolFlags.Value);
		let expression, witnessExpression;
		if (valueSymbol) {
			const projection = type.getCallSignatures().length
				? 'Parameters'
				: type.getConstructSignatures().length
					? 'ConstructorParameters'
					: null;
			expression = projection
				? `${projection}<typeof ${actual}>['length']`
				: `keyof typeof ${actual}`;
			witnessExpression = projection
				? `${projection}<typeof ${reference}>['length']`
				: `keyof typeof ${reference}`;
		} else {
			const params = decl?.typeParameters ?? [];
			const required = params.reduce((last, p, i) => (p.default ? last : i), -1);
			const args = params.slice(0, required + 1).map((param) => argument(param, exp.name));
			const suffix = args.length ? '<' + args.join(', ') + '>' : '';
			expression = actual + suffix;
			witnessExpression = reference + suffix;
		}

		if (['LinkComponentProps', 'UseLinkPropsOptions', 'ValidateLinkOptions'].includes(exp.name)) {
			expression = `keyof Omit<${expression}, keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicElements['a'] | keyof import('octane/jsx-runtime').Octane.JSX.IntrinsicAttributes>`;
			witnessExpression = `keyof Omit<${witnessExpression}, keyof import('react').JSX.IntrinsicElements['a']>`;
		}
		if (exp.name === 'CatchBoundary') {
			expression = `keyof Parameters<typeof ${actual}>[0]`;
			witnessExpression = `keyof ConstructorParameters<typeof ${reference}>[0]`;
		}
		records.push({
			id: records.length,
			name: exp.name,
			spec,
			expression,
			witnessExpression,
			value: valueSymbol,
		});
	}
}
function argument(p, name) {
	const n = p.name.text,
		b = p.constraint?.getText() ?? '';
	if (b === 'RouterEvent') return "import('@tanstack/router-core').RouterEvent";
	if (b === 'TrailingSlashOption') return "'never'";
	if (b === 'AnyMatchAndValue') return "{match: {id: '/example'}; value: {value: string}}";
	if (n === 'TRouterHistory') return "import('@tanstack/history').RouterHistory";
	if (b.startsWith('keyof ')) return "'value'";
	if (b.includes('AnySerializationAdapter')) return '[]';
	if (b.includes('ReadonlyArray') || b.includes('readonly ') || b === 'Array<any>')
		return "readonly ['first', 'second']";
	if (b.includes('AnySerializationAdapter')) return '[]';
	if (/Comp/.test(n)) return "'a'";
	if (/Props/.test(n)) return '{ value: string }';
	if (/Router/.test(n)) return "import('@tanstack/router-core').AnyRouter";
	if (/ParentRoute|RouteTree|Route$/.test(n)) return "import('@tanstack/react-router').RootRoute";
	if (/Register/.test(n)) return '{}';
	if (b === 'boolean') return 'true';
	if (b === 'string' || /extends string/.test(b) || /TPath|TFullPath|TCustomId|TId/.test(b))
		return "'/example'";
	if (b.includes('Record<string')) return '{ value: string }';
	if (b === 'number') return '1';
	if (b === 'Function') return '() => void';
	if (b.endsWith('[]')) return '[]';
	if (
		n === 'TFrom' ||
		n === 'TTo' ||
		n === 'TFromOrTo' ||
		n === 'TFullPath' ||
		n === 'TPath' ||
		n === 'TId'
	)
		return "'/example'";
	return '{ value: string }';
}
const probe = dir + '/typetests/public-contracts.probe.ts';
function writeProbe() {
	fs.writeFileSync(
		probe,
		records.map((r) => `type Probe_${r.id} = ${r.witnessExpression};`).join('\n'),
	);
}
writeProbe();
let q = createTypeEvidenceProgram([probe], parsed.options),
	cc = q.getTypeChecker();
const diagnostics = ts.getPreEmitDiagnostics(q).filter((d) => d.file?.fileName === probe);
if (diagnostics.length) {
	console.log(
		ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCurrentDirectory: () => root,
			getCanonicalFileName: (x) => x,
			getNewLine: () => '\n',
		}),
	);
	process.exit(1);
}
for (const d of q.getSourceFile(probe).statements) {
	const r = records[Number(d.name.text.slice(6))];
	if (r.value || r.expression.startsWith('keyof Omit<')) continue;
	const t = cc.getTypeFromTypeNode(d.type);
	const primitive = (t) =>
		Boolean(
			t.flags &
			(ts.TypeFlags.StringLike |
				ts.TypeFlags.NumberLike |
				ts.TypeFlags.BooleanLike |
				ts.TypeFlags.Undefined |
				ts.TypeFlags.Null |
				ts.TypeFlags.Never |
				ts.TypeFlags.ESSymbolLike),
		);
	if (!(primitive(t) || (t.isUnion() && t.types.every(primitive)))) {
		r.expression = 'keyof ' + r.expression;
		r.witnessExpression = 'keyof ' + r.witnessExpression;
	}
}
writeProbe();
q = createTypeEvidenceProgram([probe], parsed.options);
cc = q.getTypeChecker();
const expected = {};
function render(t, node) {
	if (t.isUnion()) return t.types.map((x) => render(x, node)).join(' | ');
	if (t.flags & ts.TypeFlags.StringLiteral) return JSON.stringify(t.value);
	if (t.flags & ts.TypeFlags.NumberLiteral) return String(t.value);
	return cc.typeToString(t, node, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
}
for (const d of q.getSourceFile(probe).statements) {
	const r = records[Number(d.name.text.slice(6))],
		type = cc.getTypeFromTypeNode(d.type);
	expected[r.id] = render(type, d).replace(
		/import\("[^"]*previous-binding\/src\/index"\)/g,
		"import('\@tanstack/router-core')",
	);
	if (type.flags & ts.TypeFlags.UniqueESSymbol)
		expected[r.id] = "import('@tanstack/router-core').TSR_SERIALIZABLE";
	if (/\b(any|unknown)\b/.test(expected[r.id]))
		throw Error('Imprecise projection ' + r.name + ' ' + expected[r.id]);
}

// Explicit native calling conventions and newly supported upstream asset controls.
for (const r of records) {
	if (
		[
			'useMatch',
			'useLocation',
			'useParams',
			'useSearch',
			'useLoaderData',
			'useLoaderDeps',
			'useRouteContext',
			'useMatches',
			'useParentMatches',
			'useChildMatches',
			'useNavigate',
		].includes(r.name)
	)
		expected[r.id] += ' | 2';
	if (r.name === 'useHydrated') expected[r.id] = '0 | 1';
	if (r.name === 'SerializationError')
		expected[r.id] = "keyof import('@tanstack/router-core').SerializationError<'/example'>";
	if (r.name === 'useLayoutEffect') expected[r.id] += ' | 3';
	if (r.name === 'useLinkProps') expected[r.id] = '1';
	if (['Outlet', 'ScrollRestoration'].includes(r.name)) expected[r.id] = '0';
	if (r.name === 'AssetProps') expected[r.id] += ' | "nonce" | "preventScriptHoist"';
}
async function writeFormatted(path, source) {
	fs.writeFileSync(
		path,
		await prettier.format(source, {
			...(await prettier.resolveConfig(path)),
			filepath: path,
		}),
	);
}
await writeFormatted(
	dir + '/typetests/expected-public-contracts.d.ts',
	'// Independent projections of authenticated published and prior native declarations.\nexport interface ExpectedPublicContracts {\n' +
		records.map((r) => `// ${r.spec}.${r.name}\n${r.id}: ${expected[r.id]};`).join('\n') +
		'\n}\n',
);
await writeFormatted(
	dir + '/tests/types/all-exports.test-d.ts',
	"import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';\nimport type { ExpectedPublicContracts } from '../../typetests/expected-public-contracts';\n" +
		imports.join('\n') +
		'\n' +
		records
			.map(
				(r) =>
					`type Contract_${r.id}_${r.name.replace(/\W/g, '_')} = Assert<Equal<${r.expression.replaceAll("import('@tanstack/react-router').RootRoute", 'Actual0.RootRoute')}, ExpectedPublicContracts[${r.id}]>>;`,
			)
			.join('\n') +
		'\n',
);
fs.unlinkSync(probe);
console.log('Generated', records.length, 'independent public contracts');
