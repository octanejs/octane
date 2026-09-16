import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { parseModule } from '@tsrx/core';

function runtimeImports(source: string): Set<string> {
	const { code } = compile(source, 'controlled-binding-codegen.tsrx', { hmr: false });
	return new Set(
		parseModule(code, 'controlled-binding-codegen.js').body.flatMap((node) =>
			node.type === 'ImportDeclaration' && node.source.value.startsWith('octane')
				? node.specifiers.flatMap((specifier) =>
						specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
							? [specifier.imported.name]
							: [],
					)
				: [],
		),
	);
}

describe('controlled binding specialization', () => {
	it('recognizes opaque checked handles without relaxing default-value ownership', () => {
		const imports = runtimeImports(`
			export function Form(props) @{
				<>
					<input defaultValue={props.inputDefault} />
					<textarea defaultValue={props.textareaDefault} />
					<input type="checkbox" checked={props.box} />
					<input type="radio" checked={props.radio} />
				</>
			}
		`);
		expect(imports).toContain('setDefaultValueUncontrolled');
		expect(imports).toContain('bindSignalChecked');
		expect(imports).not.toContain('setCheckedCheckable');
		expect(imports).not.toContain('setDefaultValue');
		expect(imports).not.toContain('setChecked');
	});

	it('recognizes opaque handles on conflicting, spread, select, or dynamic-type hosts', () => {
		const imports = runtimeImports(`
			export function Form(props) @{
				<>
					<input value={props.value} defaultValue={props.inputDefault} />
					<input {...props.input} defaultValue={props.spreadDefault} />
					<select defaultValue={props.selectDefault}></select>
					<input type={props.type} checked={props.dynamicChecked} />
					<input type="checkbox" {...props.box} checked={props.spreadChecked} />
				</>
			}
		`);
		expect(imports).toContain('setDefaultValue');
		expect(imports).toContain('bindSignalChecked');
		expect(imports).toContain('bindSignalHostPropSources');
		expect(imports).not.toContain('setDefaultValueUncontrolled');
		expect(imports).not.toContain('setCheckedCheckable');
	});

	it('keeps lean scalar helpers when the value and whole host prove their ownership', () => {
		const imports = runtimeImports(`
			export function Form(props) @{
				<>
					<input defaultValue={props.inputDefault} />
					<textarea defaultValue={props.textareaDefault} />
					<input type="checkbox" checked={!!props.box} />
					<input type="radio" checked={props.radio === true} />
				</>
			}
		`);
		expect(imports).toContain('setDefaultValueUncontrolled');
		expect(imports).toContain('setCheckedCheckable');
		expect(imports).not.toContain('setDefaultValue');
		expect(imports).not.toContain('setChecked');
		expect(imports).not.toContain('bindSignalChecked');
	});

	it('keeps generic scalar helpers for conflicting, select, or dynamic-type hosts', () => {
		const imports = runtimeImports(`
			export function Form(props) @{
				<>
					<input value={props.value.get()} defaultValue={props.inputDefault} />
					<select defaultValue={props.selectDefault}></select>
					<input type={props.type} checked={!!props.dynamicChecked} />
				</>
			}
		`);
		expect(imports).toContain('setDefaultValue');
		expect(imports).toContain('setChecked');
		expect(imports).not.toContain('setDefaultValueUncontrolled');
		expect(imports).not.toContain('setCheckedCheckable');
		expect(imports).not.toContain('bindSignalChecked');
	});
});
