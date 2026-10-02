import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const CLIENT_PROCESS_DECLARATION = `// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// \`declare global\`, which would ship in the tarball — so this file type-checks in
// a browser app that has no \`@types/node\`.
declare const process: { env: { NODE_ENV?: string } };

`;

function renderFormatter(runtime, catalog) {
	const functionName = runtime === 'client' ? 'formatClientError' : 'formatServerError';
	const argumentsTypeName = runtime === 'client' ? 'ClientErrorArguments' : 'ServerErrorArguments';
	const processDeclaration = runtime === 'client' ? CLIENT_PROCESS_DECLARATION : '';
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

	return `// This file is generated by scripts/error-codes/generate.mjs. Do not edit.\n${processDeclaration}import {\n\tformatDevErrorMessage,\n\tformatProdErrorMessage,\n\tformatUnknownDevErrorMessage,\n} from './error-message.js';\n\ntype ${argumentsTypeName} = {\n${argumentTypes}\n};\n\nexport function ${functionName}<Code extends keyof ${argumentsTypeName}>(\n\tcode: Code,\n\t...args: ${argumentsTypeName}[Code]\n): string {\n\tif (process.env.NODE_ENV !== 'production') {\n\t\tswitch (code) {\n${indentedCases}\n\t\t\tdefault:\n\t\t\t\treturn formatUnknownDevErrorMessage(code);\n\t\t}\n\t}\n\treturn formatProdErrorMessage(code, args);\n}\n`;
}

export function generateFiles(catalog) {
	validateCatalog(catalog);
	return Object.fromEntries(
		Object.keys(generatedFiles).map((runtime) => [runtime, renderFormatter(runtime, catalog)]),
	);
}

// Framework modules outside the two runtime entries whose Error messages must
// also come from the catalog. Paths are relative to packages/octane/src.
// independent-hydration-protocol.ts shares its manifest message with
// hydration/independent-island.ts, so it is covered with the hydration modules.
const COVERED_MODULE =
	/^(?:signals\/[^/]+|hydration\/[^/]+|dom-bindings?(?:-[a-z-]+)?|independent-hydration-protocol)\.ts$/;
// Surfaces follow static import reachability from the package entries: modules
// reachable only from client entries are "client"; only from server entries
// (runtime.server.ts, octane/server, octane/signals/server, ...) are "server".
// Everything else in scope is "shared": octane/signals, octane/hydration, and
// the modules they pull in also load in SSR bundles.
//
// Shared modules call formatClientError() with codes registered for both
// runtimes. The client formatter declares `process` only at the type level and
// reads process.env.NODE_ENV exactly as the server formatter does, so it is safe
// in Node. Client bundles keep a single message table; the server table merely
// repeats those dev-only messages. Misclassifying a module is therefore a
// catalog-metadata error, never a runtime one, which is why unlisted covered
// modules default to "shared".
const CLIENT_ONLY_MODULES = new Set([
	'dom-binding-claims.ts',
	'dom-binding-classes.ts',
	'dom-binding-controls.ts',
	'dom-binding-island.ts',
	'dom-binding-program.ts',
	'dom-binding-projections.ts',
	'dom-binding-signals.ts',
	'dom-binding-styles.ts',
	'dom-bindings.ts',
	'signals/client.ts',
	'signals/native-read-client.ts',
	'signals/native-read-events.ts',
	'signals/native-read-inspection.ts',
	'signals/native-read-retry.ts',
	'signals/transition-candidate.ts',
]);
const SERVER_ONLY_MODULES = new Set(['signals/native-read-server.ts', 'signals/server.ts']);

export function frameworkErrorSurface(filename) {
	if (filename === 'runtime.ts') return 'client';
	if (filename === 'runtime.server.ts') return 'server';
	if (!COVERED_MODULE.test(filename)) return undefined;
	if (CLIENT_ONLY_MODULES.has(filename)) return 'client';
	if (SERVER_ONLY_MODULES.has(filename)) return 'server';
	return 'shared';
}

export function validateRuntimeUsages(catalog, sources) {
	const used = { client: new Set(), server: new Set() };
	const covered = [];
	for (const [filename, source] of sources) {
		const surface = frameworkErrorSurface(filename);
		if (surface === undefined) continue;
		const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
		covered.push([filename, sourceFile, surface]);
	}
	const errorClasses = collectErrorClasses(covered.map(([, sourceFile]) => sourceFile));
	for (const [filename, sourceFile, surface] of covered) {
		validateFrameworkErrorConstruction(filename, sourceFile, surface, catalog, used, errorClasses);
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

// Built-in constructors mapped to the index of their message argument.
const ERROR_CONSTRUCTORS = new Map([
	['AggregateError', 1],
	['Error', 0],
	['EvalError', 0],
	['RangeError', 0],
	['ReferenceError', 0],
	['SyntaxError', 0],
	['TypeError', 0],
	['URIError', 0],
]);

function extendedClassName(node) {
	const clause = node.heritageClauses?.find(
		(heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword,
	);
	const base = clause?.types[0]?.expression;
	return base !== undefined && ts.isIdentifier(base) ? base.text : undefined;
}

function findSuperCall(node) {
	if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword) return node;
	if (ts.isFunctionLike(node) || ts.isClassLike(node)) return undefined;
	return ts.forEachChild(node, findSuperCall);
}

function forwardedParameterIndex(constructor, message) {
	if (message === undefined) return -1;
	message = unwrapExpression(message);
	if (!ts.isIdentifier(message)) return -1;
	return constructor.parameters.findIndex(
		(parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === message.text,
	);
}

/**
 * Error subclasses declared in covered modules, mapped to the constructor
 * argument that becomes the message, or null when the subclass formats its own
 * message in super(). Constructions of a forwarding subclass (new
 * SignalFrameError(message)) are then checked exactly like `new Error(message)`,
 * and a self-formatting super() call is checked as a construction site.
 */
function collectErrorClasses(sourceFiles) {
	const classes = new Map(ERROR_CONSTRUCTORS);
	const declarations = [];
	for (const sourceFile of sourceFiles) {
		const visit = (node) => {
			if (ts.isClassLike(node) && node.name !== undefined) declarations.push(node);
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}
	for (let changed = true; changed;) {
		changed = false;
		for (const declaration of declarations) {
			const name = declaration.name.text;
			const parent = extendedClassName(declaration);
			if (classes.has(name) || parent === undefined || !classes.has(parent)) continue;
			const parentIndex = classes.get(parent);
			const constructor = declaration.members.find(ts.isConstructorDeclaration);
			const superCall = constructor?.body && findSuperCall(constructor.body);
			let index = parentIndex;
			if (constructor !== undefined && parentIndex !== null) {
				const forwarded = forwardedParameterIndex(constructor, superCall?.arguments[parentIndex]);
				index = forwarded === -1 ? null : forwarded;
			}
			classes.set(name, index);
			changed = true;
		}
	}
	return classes;
}

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

// `cause instanceof Error ? cause.message : <coded fallback>`: rewrapping a
// caught foreign error (a failed fetch or reader) keeps that error's own text.
function isCaughtErrorMessage(condition, value) {
	condition = unwrapExpression(condition);
	value = unwrapExpression(value);
	return (
		ts.isBinaryExpression(condition) &&
		condition.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
		ts.isIdentifier(condition.left) &&
		ts.isIdentifier(condition.right) &&
		condition.right.text === 'Error' &&
		ts.isPropertyAccessExpression(value) &&
		value.name.text === 'message' &&
		sameDynamicExpression(value.expression, condition.left)
	);
}

function isAllowedErrorMessage(node, formatterName) {
	node = unwrapExpression(node);
	if (isDirectFormatterCall(node, formatterName)) return true;
	if (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
	) {
		// A compiled DOM binding definition carries the compiler's own reason an
		// opaque view is not constructible; that message is emitted program data,
		// so only the runtime's fallback is catalogued.
		const carried = unwrapExpression(node.left);
		return (
			ts.isPropertyAccessExpression(carried) &&
			carried.name.text === 'constructionError' &&
			isAllowedErrorMessage(node.right, formatterName)
		);
	}
	if (!ts.isConditionalExpression(node)) return false;
	// Choosing between catalogued messages keeps every branch coded.
	if (
		isAllowedErrorMessage(node.whenTrue, formatterName) &&
		isAllowedErrorMessage(node.whenFalse, formatterName)
	) {
		return true;
	}
	if (
		isCaughtErrorMessage(node.condition, node.whenTrue) &&
		isAllowedErrorMessage(node.whenFalse, formatterName)
	) {
		return true;
	}
	const fallback = unwrapExpression(node.whenFalse);
	// The audited runtime exception transports a server-provided Error.message
	// when it is a string and substitutes registered code 23 only for malformed
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

function validateFrameworkErrorConstruction(
	filename,
	sourceFile,
	surface,
	catalog,
	used,
	errorClasses,
) {
	const formatterName = surface === 'server' ? 'formatServerError' : 'formatClientError';
	const formatterRuntime = surface === 'server' ? 'server' : 'client';
	const requiredRuntimes = surface === 'shared' ? ['client', 'server'] : [surface];

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
		if (runtime !== formatterRuntime) {
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
		for (const required of requiredRuntimes) {
			if (!entry.runtime.includes(required)) {
				fail(`${location(node)} references code ${code}, which is not registered for ${required}.`);
			}
		}
		const argumentCount = node.arguments.length - 1;
		if (argumentCount !== entry.argumentCount) {
			fail(
				`${location(node)} passes ${argumentCount} arguments to ${runtime} code ${code}; expected ${entry.argumentCount}.`,
			);
		}
		for (const required of requiredRuntimes) used[required].add(code);
	}

	function validateMessage(node, name, message) {
		if (message === undefined || !isAllowedErrorMessage(message, formatterName)) {
			fail(`${location(node)} constructs ${name} without a direct ${formatterName}() message.`);
		}
	}

	function validateSuperCall(node) {
		let owner = node.parent;
		while (owner !== undefined && !ts.isClassLike(owner)) owner = owner.parent;
		const parent = owner && extendedClassName(owner);
		const messageIndex = parent === undefined ? undefined : errorClasses.get(parent);
		// A null index means the parent formats its own message; super() then
		// passes data, not a message.
		if (messageIndex === undefined || messageIndex === null) return;
		const message = node.arguments[messageIndex];
		const constructor = ts.findAncestor(node, ts.isConstructorDeclaration);
		// Forwarding a constructor parameter is checked at each construction site.
		if (constructor !== undefined && forwardedParameterIndex(constructor, message) !== -1) return;
		validateMessage(node, `${parent} via super()`, message);
	}

	function visit(node) {
		if (ts.isCallExpression(node)) {
			if (node.expression.kind === ts.SyntaxKind.SuperKeyword) validateSuperCall(node);
			else validateFormatterCall(node);
		}
		const isErrorCall = ts.isCallExpression(node) || ts.isNewExpression(node);
		if (isErrorCall && ts.isIdentifier(node.expression)) {
			const messageIndex = errorClasses.get(node.expression.text);
			if (messageIndex !== undefined && messageIndex !== null) {
				validateMessage(node, node.expression.text, node.arguments?.[messageIndex]);
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
}

function runtimeSources() {
	const sourceDir = join(root, 'packages/octane/src');
	const filenames = ['.', 'signals', 'hydration'].flatMap((directory) =>
		readdirSync(join(sourceDir, directory))
			.filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
			.map((name) => (directory === '.' ? name : `${directory}/${name}`)),
	);
	return filenames
		.filter((filename) => frameworkErrorSurface(filename) !== undefined)
		.sort()
		.map((filename) => [filename, readFileSync(join(sourceDir, filename), 'utf8')]);
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
