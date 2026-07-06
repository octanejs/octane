// Runnable repro for a @tsrx/core PARSER bug found while bridging E5.
//
//   node packages/react-compat/known-issues/tsrx-conditional-jsx-parse.mjs
//
// The TSRX parser (`parseModule` in @tsrx/core, reached via octane's compiler)
// throws `Unexpected token` on a very specific — and very common, because it's
// exactly what Prettier emits — JSX shape. ALL of these must hold at once:
//
//   1. a JSX **child** expression container `{ … }` (hole),
//   2. holding a **conditional** (`? :` or `&&`),
//   3. whose branch is **parenthesized** across multiple lines,
//   4. and that branch's element has a **non-self-closing child element on its
//      own line** (depth ≥ 2).
//
// Change ANY one axis and it parses fine (see the passing neighbours below):
// inner self-closing, inner is text, inner on the same line as its parent,
// depth-1 (no wrapper), single-line branch, or no parentheses.
//
// Root cause is upstream in @tsrx/core's JSX tokenizer-context handling
// (`parseExprAtom` / `#filterTemplateScriptContexts` / the expression-container
// context baselines in src/plugin.js): the `(`-parenthesized nested JSX subtree
// inside a conditional branch underflows/mis-restores the tc_expr/tc_oTag/
// tc_cTag context stack. The error points at the `(` (col of the branch's open
// paren).
import { compile } from 'octane/compiler';

const wrap = (branch) =>
	`export function C(){\n  return (\n    <div>\n      {c ? (\n${branch}\n      ) : null}\n    </div>\n  );\n}`;

const cases = {
	'FAIL (minimal): depth-2, non-self-closing child on own line':
		'        <P>\n          <s>hi</s>\n        </P>',
	'ok: inner self-closing': '        <P>\n          <s/>\n        </P>',
	'ok: inner is text': '        <P>\n          hi\n        </P>',
	'ok: inner on same line as parent': '        <P><s>hi</s></P>',
	'ok: depth-1 (no wrapper)': '        <s>hi</s>',
};

let sawFailure = false;
for (const [name, branch] of Object.entries(cases)) {
	try {
		compile(wrap(branch), 'C.tsx', { mode: 'client' });
		console.log('OK    ', name);
	} catch (e) {
		sawFailure = true;
		const at = (e.message.match(/\d+:\d+/) || ['?'])[0];
		console.log('FAIL  ', name, `→ ${e.message.split('(')[0].trim()} @${at}`);
	}
}
process.exit(sawFailure ? 1 : 0);
