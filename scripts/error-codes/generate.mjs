import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogFile = join(root, 'packages/octane/error-codes/codes.json');
const generatedFiles = {
	client: join(root, 'packages/octane/src/error-codes.client.generated.ts'),
	server: join(root, 'packages/octane/src/error-codes.server.generated.ts'),
};

function fail(message) {
	throw new Error(`Invalid Octane error-code catalog: ${message}`);
}

export function validateCatalog(catalog) {
	if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) {
		fail('the root must be an object.');
	}
	if (catalog.schemaVersion !== 1) fail('schemaVersion must be 1.');
	if (!Number.isSafeInteger(catalog.nextCode) || catalog.nextCode < 1) {
		fail('nextCode must be a positive safe integer.');
	}
	if (catalog.codes === null || typeof catalog.codes !== 'object' || Array.isArray(catalog.codes)) {
		fail('codes must be an object.');
	}

	let maximumCode = 0;
	const activeMessages = new Map();
	for (const [rawCode, entry] of Object.entries(catalog.codes)) {
		const code = Number(rawCode);
		if (!Number.isSafeInteger(code) || code < 1 || String(code) !== rawCode) {
			fail(`code ${JSON.stringify(rawCode)} must be a canonical positive integer.`);
		}
		maximumCode = Math.max(maximumCode, code);
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
			fail(`code ${code} must be an object.`);
		}
		if (typeof entry.message !== 'string' || entry.message.length === 0) {
			fail(`code ${code} must have a non-empty message.`);
		}
		if (!Number.isSafeInteger(entry.argumentCount) || entry.argumentCount < 0) {
			fail(`code ${code} must have a non-negative argumentCount.`);
		}
		const placeholders = entry.message.match(/%s/g)?.length ?? 0;
		if (placeholders !== entry.argumentCount) {
			fail(
				`code ${code} declares ${entry.argumentCount} arguments but contains ${placeholders} %s placeholders.`,
			);
		}
		if (entry.status !== 'active' && entry.status !== 'retired') {
			fail(`code ${code} status must be "active" or "retired".`);
		}
		if (
			!Array.isArray(entry.runtime) ||
			entry.runtime.length === 0 ||
			entry.runtime.some((runtime) => runtime !== 'client' && runtime !== 'server') ||
			new Set(entry.runtime).size !== entry.runtime.length
		) {
			fail(`code ${code} runtime must contain unique "client" and/or "server" entries.`);
		}
		if (entry.status === 'active') {
			const duplicate = activeMessages.get(entry.message);
			if (duplicate !== undefined) {
				fail(`codes ${duplicate} and ${code} have the same active message.`);
			}
			activeMessages.set(entry.message, code);
		}
	}
	if (catalog.nextCode <= maximumCode) {
		fail(`nextCode (${catalog.nextCode}) must be greater than the highest code (${maximumCode}).`);
	}
	return catalog;
}

export function validateCatalogCompatibility(previous, current) {
	validateCatalog(previous);
	validateCatalog(current);
	if (current.schemaVersion !== previous.schemaVersion) {
		fail('schemaVersion cannot change while checking published-code compatibility.');
	}
	if (current.nextCode < previous.nextCode) {
		fail(`nextCode cannot move backwards from ${previous.nextCode} to ${current.nextCode}.`);
	}

	for (const [code, previousEntry] of Object.entries(previous.codes)) {
		const currentEntry = current.codes[code];
		if (currentEntry === undefined) fail(`published code ${code} cannot be deleted.`);
		if (currentEntry.argumentCount !== previousEntry.argumentCount) {
			fail(`published code ${code} cannot change its argument shape; allocate a new code.`);
		}
		if (currentEntry.message !== previousEntry.message) {
			fail(`published code ${code} cannot change its message; allocate a new code.`);
		}
		if (previousEntry.status === 'retired' && currentEntry.status !== 'retired') {
			fail(`retired code ${code} cannot be reactivated.`);
		}
		for (const runtime of previousEntry.runtime) {
			if (!currentEntry.runtime.includes(runtime)) {
				fail(`published code ${code} cannot drop its ${runtime} runtime surface.`);
			}
		}
	}

	for (const code of Object.keys(current.codes)) {
		if (previous.codes[code] === undefined && Number(code) < previous.nextCode) {
			fail(
				`new code ${code} cannot reuse a number below the published nextCode ${previous.nextCode}.`,
			);
		}
	}
}

function renderFormatter(runtime, catalog) {
	const functionName = runtime === 'client' ? 'formatClientError' : 'formatServerError';
	const argumentsTypeName = runtime === 'client' ? 'ClientErrorArguments' : 'ServerErrorArguments';
	const quote = (value) =>
		`'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
	const entries = Object.entries(catalog.codes).filter(
		([, entry]) => entry.status === 'active' && entry.runtime.includes(runtime),
	);
	const argumentTypes = entries
		.map(
			([code, entry]) =>
				`\t${code}: [${Array.from({ length: entry.argumentCount }, () => 'unknown').join(', ')}];`,
		)
		.join('\n');
	const cases = entries
		.map(
			([code, entry]) =>
				`\t\tcase ${code}:\n\t\t\treturn formatDevErrorMessage(\n\t\t\t\t${quote(entry.message)},\n\t\t\t\targs,\n\t\t\t);`,
		)
		.join('\n');
	const indentedCases = cases
		.split('\n')
		.map((line) => `\t${line}`)
		.join('\n');

	return `// This file is generated by scripts/error-codes/generate.mjs. Do not edit.\nimport {\n\tformatDevErrorMessage,\n\tformatProdErrorMessage,\n\tformatUnknownDevErrorMessage,\n} from './error-message.js';\n\ntype ${argumentsTypeName} = {\n${argumentTypes}\n};\n\nexport function ${functionName}<Code extends keyof ${argumentsTypeName}>(\n\tcode: Code,\n\t...args: ${argumentsTypeName}[Code]\n): string {\n\tif (process.env.NODE_ENV !== 'production') {\n\t\tswitch (code) {\n${indentedCases}\n\t\t\tdefault:\n\t\t\t\treturn formatUnknownDevErrorMessage(code);\n\t\t}\n\t}\n\treturn formatProdErrorMessage(code, args);\n}\n`;
}

export function generateFiles(catalog) {
	validateCatalog(catalog);
	return Object.fromEntries(
		Object.keys(generatedFiles).map((runtime) => [runtime, renderFormatter(runtime, catalog)]),
	);
}

export function validateRuntimeUsages(catalog, sources) {
	const used = { client: new Set(), server: new Set() };
	for (const [filename, source] of sources) {
		const surface =
			filename === 'runtime.ts'
				? 'client'
				: filename === 'runtime.server.ts'
					? 'server'
					: undefined;
		if (surface !== undefined) {
			validateFrameworkErrorConstruction(filename, source, surface, catalog, used);
		}
	}
	for (const [rawCode, entry] of Object.entries(catalog.codes)) {
		if (entry.status !== 'active') continue;
		const code = Number(rawCode);
		for (const runtime of entry.runtime) {
			if (!used[runtime].has(code)) {
				fail(`active ${runtime} code ${code} has no runtime call site.`);
			}
		}
	}
}

const ERROR_CONSTRUCTORS = new Set([
	'AggregateError',
	'Error',
	'EvalError',
	'MaximumUpdateDepthError',
	'RangeError',
	'ReferenceError',
	'SyntaxError',
	'TypeError',
	'URIError',
]);

function unwrapExpression(node) {
	while (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isNonNullExpression(node) ||
		ts.isSatisfiesExpression(node)
	) {
		node = node.expression;
	}
	return node;
}

function isDirectFormatterCall(node, formatterName) {
	node = unwrapExpression(node);
	return (
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === formatterName
	);
}

function isHydrationPayloadMessage(node) {
	node = unwrapExpression(node);
	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'payload' &&
		node.name.text === 'message'
	);
}

function sameDynamicExpression(left, right) {
	left = unwrapExpression(left);
	right = unwrapExpression(right);
	if (ts.isIdentifier(left) && ts.isIdentifier(right)) return left.text === right.text;
	if (ts.isPropertyAccessExpression(left) && ts.isPropertyAccessExpression(right)) {
		return (
			left.name.text === right.name.text && sameDynamicExpression(left.expression, right.expression)
		);
	}
	return false;
}

function isStringTypeGuard(condition, value) {
	condition = unwrapExpression(condition);
	if (
		!ts.isBinaryExpression(condition) ||
		condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
	)
		return false;
	return [
		[condition.left, condition.right],
		[condition.right, condition.left],
	].some(
		([typeCheck, literal]) =>
			ts.isTypeOfExpression(typeCheck) &&
			ts.isStringLiteral(literal) &&
			literal.text === 'string' &&
			sameDynamicExpression(typeCheck.expression, value),
	);
}

function isAllowedErrorMessage(node, formatterName) {
	node = unwrapExpression(node);
	if (isDirectFormatterCall(node, formatterName)) return true;
	if (!ts.isConditionalExpression(node)) return false;
	const fallback = unwrapExpression(node.whenFalse);
	// The one audited exception transports a server-provided Error.message when
	// it is a string and substitutes registered code 23 only for malformed
	// payloads. Keep this exact so arbitrary local framework strings cannot evade
	// production-code enforcement behind a conditional.
	return (
		formatterName === 'formatClientError' &&
		isHydrationPayloadMessage(node.whenTrue) &&
		isStringTypeGuard(node.condition, node.whenTrue) &&
		isDirectFormatterCall(fallback, formatterName) &&
		fallback.arguments.length === 1 &&
		ts.isNumericLiteral(fallback.arguments[0]) &&
		fallback.arguments[0].text === '23'
	);
}

function validateFrameworkErrorConstruction(filename, source, surface, catalog, used) {
	const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
	const formatterName = surface === 'client' ? 'formatClientError' : 'formatServerError';

	function location(node) {
		const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		return `${filename}:${position.line + 1}:${position.character + 1}`;
	}

	function validateFormatterCall(node) {
		if (!ts.isIdentifier(node.expression)) return;
		const formatter = node.expression.text;
		const runtime =
			formatter === 'formatClientError'
				? 'client'
				: formatter === 'formatServerError'
					? 'server'
					: undefined;
		if (runtime === undefined) return;
		if (runtime !== surface) {
			fail(`${location(node)} cannot use the ${runtime} formatter in the ${surface} runtime.`);
		}
		const codeNode = node.arguments[0];
		if (codeNode === undefined || !ts.isNumericLiteral(codeNode)) {
			fail(`${location(node)} must reference a literal Octane error code.`);
		}
		const code = Number(codeNode.text);
		if (!Number.isSafeInteger(code) || code < 1 || codeNode.text !== String(code)) {
			fail(`${location(node)} must reference a canonical positive integer error code.`);
		}
		const entry = catalog.codes[String(code)];
		if (entry === undefined) fail(`${location(node)} references unknown ${runtime} code ${code}.`);
		if (entry.status !== 'active') fail(`${location(node)} references retired code ${code}.`);
		if (!entry.runtime.includes(runtime)) {
			fail(`${location(node)} references code ${code}, which is not registered for ${runtime}.`);
		}
		const argumentCount = node.arguments.length - 1;
		if (argumentCount !== entry.argumentCount) {
			fail(
				`${location(node)} passes ${argumentCount} arguments to ${runtime} code ${code}; expected ${entry.argumentCount}.`,
			);
		}
		used[runtime].add(code);
	}

	function visit(node) {
		if (ts.isCallExpression(node)) validateFormatterCall(node);
		const isErrorCall = ts.isCallExpression(node) || ts.isNewExpression(node);
		if (
			isErrorCall &&
			ts.isIdentifier(node.expression) &&
			ERROR_CONSTRUCTORS.has(node.expression.text)
		) {
			const messageIndex = node.expression.text === 'AggregateError' ? 1 : 0;
			const message = node.arguments?.[messageIndex];
			if (message === undefined || !isAllowedErrorMessage(message, formatterName)) {
				fail(
					`${location(node)} constructs ${node.expression.text} without a direct ${formatterName}() message.`,
				);
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
}

function runtimeSources() {
	const sourceDir = join(root, 'packages/octane/src');
	return ['runtime.ts', 'runtime.server.ts'].map((filename) => [
		filename,
		readFileSync(join(sourceDir, filename), 'utf8'),
	]);
}

async function formatGeneratedFile(source, filename) {
	const config = (await resolveConfig(filename)) ?? {};
	return format(source, { ...config, filepath: filename });
}

async function main() {
	const check = process.argv.includes('--check');
	const catalog = validateCatalog(JSON.parse(readFileSync(catalogFile, 'utf8')));
	const compatibilityBase = process.env.OCTANE_ERROR_CODES_BASE;
	if (compatibilityBase !== undefined) {
		try {
			execFileSync('git', ['cat-file', '-e', `${compatibilityBase}^{commit}`], {
				cwd: root,
				stdio: 'ignore',
			});
		} catch {
			fail(`cannot resolve compatibility base ${JSON.stringify(compatibilityBase)}.`);
		}
		let previousSource;
		try {
			previousSource = execFileSync(
				'git',
				['show', `${compatibilityBase}:packages/octane/error-codes/codes.json`],
				{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
			);
		} catch {
			// The first release of the catalog has no prior file to compare. Every
			// later PR/push is checked against its base commit by CI.
			previousSource = undefined;
		}
		if (previousSource !== undefined) {
			validateCatalogCompatibility(JSON.parse(previousSource), catalog);
		}
	}
	validateRuntimeUsages(catalog, runtimeSources());
	const generated = generateFiles(catalog);
	let stale = false;
	for (const [runtime, filename] of Object.entries(generatedFiles)) {
		// Generated sources are committed and covered by the repository-wide
		// formatting gate. Produce canonical Prettier output here so generation and
		// formatting can never alternate between two representations.
		const next = await formatGeneratedFile(generated[runtime], filename);
		if (check) {
			let current = '';
			try {
				current = readFileSync(filename, 'utf8');
			} catch {
				// The missing generated file is reported as stale below.
			}
			if (current !== next) {
				console.error(`${relative(root, filename)} is stale; run pnpm error-codes:generate.`);
				stale = true;
			}
		} else {
			writeFileSync(filename, next);
			console.log(`wrote ${relative(root, filename)}`);
		}
	}
	if (stale) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
