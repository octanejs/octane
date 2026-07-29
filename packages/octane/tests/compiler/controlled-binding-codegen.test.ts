import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

function runtimeImports(source: string): Set<string> {
	const { code } = compile(source, 'controlled-binding-codegen.tsrx', { hmr: false });
	const match = code.match(/import\s*\{([^}]*)\}\s*from\s*['"]octane['"]/);
	return new Set(
		(match?.[1] ?? '')
			.split(',')
			.map((part) => part.trim().split(/\s+as\s+/)[0])
			.filter(Boolean),
	);
}

describe('controlled binding specialization', () => {
	it('uses lean helpers only when the whole host proves their ownership', () => {
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
		expect(imports).toContain('setCheckedCheckable');
		expect(imports).not.toContain('setDefaultValue');
		expect(imports).not.toContain('setChecked');
	});

	it('keeps generic helpers for conflicting, spread, select, or dynamic-type hosts', () => {
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
		expect(imports).toContain('setChecked');
		expect(imports).not.toContain('setDefaultValueUncontrolled');
		expect(imports).not.toContain('setCheckedCheckable');
	});
});
