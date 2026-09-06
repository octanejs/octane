import ts from 'typescript';

/** Mechanical ref-as-prop conversion; retain the surrounding authored bytes. */
export function adaptRefProps(source, file) {
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const edits = [];
	const visit = (node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'forwardRef'
		) {
			const fn = node.arguments[0];
			if (!fn || !(ts.isFunctionExpression(fn) || ts.isArrowFunction(fn)))
				throw new Error(
					`Ref conversion requires an inline function in ${file}:${node.getStart(ast)}`,
				);
			if (fn.parameters.length === 0) {
				edits.push({ start: node.getStart(ast), end: node.end, text: `(${fn.getText(ast)})` });
				return;
			}
			if (fn.parameters.length !== 2)
				throw new Error(`Ref conversion requires two parameters in ${file}`);
			if (!ts.isBlock(fn.body)) {
				const call = node.getText(ast);
				const a = fn.body.getStart(ast) - node.getStart(ast);
				const b = fn.body.end - node.getStart(ast);
				edits.push({
					start: node.getStart(ast),
					end: node.end,
					text: adaptRefProps(
						call.slice(0, a) + `{ return (${fn.body.getText(ast)}); }` + call.slice(b),
						file,
					),
				});
				return;
			}
			const [props, ref] = fn.parameters;
			if (!ts.isIdentifier(ref.name))
				throw new Error(`Ref conversion requires a named ref parameter in ${file}`);
			let inputName = 'propsWithRef';
			while (source.includes(inputName)) inputName += '_';
			const propsName = ts.isIdentifier(props.name) ? props.name.text : inputName + 'Rest';
			const namespace = node.expression.expression.getText(ast);
			const refType =
				ref.type?.getText(ast).replace('.ForwardedRef<', '.Ref<') ??
				`${namespace}.Ref<${node.typeArguments?.[0]?.getText(ast) ?? 'unknown'}>`;
			const propsType = props.type?.getText(ast) ?? node.typeArguments?.[1]?.getText(ast) ?? '{}';
			const parameters = `${inputName}: (${propsType}) & { ref?: ${refType} }`;
			const destructure = ts.isIdentifier(props.name)
				? ''
				: `\n  const ${props.name.getText(ast)} = ${propsName};`;
			let text = source.slice(fn.getStart(ast), fn.end);
			const changes = [
				{
					start: props.getStart(ast) - fn.getStart(ast),
					end: ref.end - fn.getStart(ast),
					text: parameters,
				},
				{
					start: fn.body.getStart(ast) + 1 - fn.getStart(ast),
					end: fn.body.getStart(ast) + 1 - fn.getStart(ast),
					text: `\n  const { ref: ${ref.name.text} = null, ...${propsName} } = ${inputName};${destructure}`,
				},
			];
			for (const change of changes.sort((a, b) => b.start - a.start))
				text = text.slice(0, change.start) + change.text + text.slice(change.end);
			text = adaptRefProps(text, file);
			edits.push({ start: node.getStart(ast), end: node.end, text: `(${text})` });
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	for (const edit of edits.sort((a, b) => b.start - a.start))
		source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
	return source;
}
