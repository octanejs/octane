// Shared runtime ICU message compiler for the generated src/intl/*/index.ts
// locale-dictionary indexes.
//
// Upstream react-aria loads its intl JSON through a Parcel transform that runs every
// message through @internationalized/string-compiler at BUILD time, turning any message
// with arguments into a function `(args, formatter) => string`.
// LocalizedStringFormatter.format only interpolates function messages — plain strings
// are returned verbatim — so exporting the raw JSON would render `Increase {fieldLabel}`
// and raw ICU plural source literally. This module is the runtime equivalent of that
// build step; each generated index applies it once at module init via
// `compileDictionaries`.
//
// It supports the ICU MessageFormat constructs the vendored dictionaries use: literal
// text (with ICU apostrophe quoting), `{argument}` interpolation, `{arg, number}`,
// `{arg, plural, …}` / `{arg, selectordinal, …}` (`offset:`, exact `=N` and category
// selectors, `#`), and `{arg, select, …}`, all arbitrarily nestable. Anything else
// (date/time arguments, number styles) throws at module init so a dictionary refresh
// that introduces a new construct fails loudly instead of silently rendering raw ICU
// source. Evaluation mirrors @internationalized/string-compiler's generated code
// exactly: `{argument}` coerces like a template literal, plural/select branches without
// arguments stay plain strings while branches with arguments become thunks over the
// current args, and `#` formats the nearest enclosing plural's value (select branches
// inherit it) through `formatter.number`.
import type {
	LocalizedString,
	LocalizedStringFormatter,
	Variables,
} from '@internationalized/string';

// Structural view of LocalizedStringFormatter's plural/select/number helpers. They are
// `protected` in the published types, but compiled messages — upstream's and these —
// call them: format() passes the formatter itself as the message function's second
// argument for exactly this purpose.
interface MessageFormatter {
	plural(
		count: number,
		options: Record<string, string | (() => string)>,
		type?: Intl.PluralRuleType,
	): string;
	select(options: Record<string, string | (() => string)>, value: string): string;
	number(value: number): string;
}

type Part =
	| { type: 'literal'; value: string }
	| { type: 'argument'; name: string }
	| { type: 'number'; name: string }
	| { type: 'pound' }
	| {
			type: 'plural';
			name: string;
			offset: number;
			pluralType: Intl.PluralRuleType;
			options: Option[];
	  }
	| { type: 'select'; name: string; options: Option[] };

// A plural/select branch. Literal-only branches pre-join to a plain string (`text`),
// matching upstream's compiled string-literal options; branches with arguments keep
// their parts and are rendered through a per-call thunk that captures the current args.
type Option = { key: string; text: string | null; parts: Part[] };

class MessageParser {
	private pos = 0;

	constructor(private message: string) {}

	parse(): Part[] {
		const parts = this.parseParts(false, false);
		if (this.pos < this.message.length) {
			throw this.error('unmatched `}`');
		}
		return parts;
	}

	private error(reason: string): Error {
		return new Error(`unsupported ICU message (${reason} at offset ${this.pos}): ${this.message}`);
	}

	// Parses parts until end of input, or until an unconsumed `}` when `nested`.
	private parseParts(nested: boolean, inPlural: boolean): Part[] {
		const msg = this.message;
		const parts: Part[] = [];
		let literal = '';
		const flush = () => {
			if (literal !== '') {
				parts.push({ type: 'literal', value: literal });
				literal = '';
			}
		};
		while (this.pos < msg.length) {
			const ch = msg[this.pos];
			if (ch === '}') {
				if (nested) {
					break;
				}
				throw this.error('unmatched `}`');
			} else if (ch === '{') {
				flush();
				parts.push(this.parseArgument(inPlural));
			} else if (ch === '#' && inPlural) {
				flush();
				parts.push({ type: 'pound' });
				this.pos++;
			} else if (ch === "'") {
				literal += this.parseQuoted(inPlural);
			} else {
				literal += ch;
				this.pos++;
			}
		}
		flush();
		return parts;
	}

	// ICU apostrophe quoting: `''` is a literal apostrophe; an apostrophe immediately
	// before a syntax character (`{`, `}`, or `#` inside plural) quotes literal text up
	// to the next lone apostrophe (an unterminated quote runs to end of message); any
	// other apostrophe is plain text.
	private parseQuoted(inPlural: boolean): string {
		const msg = this.message;
		const next = msg[this.pos + 1];
		if (next === "'") {
			this.pos += 2;
			return "'";
		}
		if (next === '{' || next === '}' || (inPlural && next === '#')) {
			this.pos += 2;
			let out = next;
			while (this.pos < msg.length) {
				if (msg[this.pos] === "'") {
					if (msg[this.pos + 1] === "'") {
						out += "'";
						this.pos += 2;
						continue;
					}
					this.pos++;
					return out;
				}
				out += msg[this.pos++];
			}
			return out;
		}
		this.pos++;
		return "'";
	}

	private parseArgument(inPlural: boolean): Part {
		this.pos++; // consume `{`
		const name = this.parseToken();
		if (!/^\w+$/.test(name)) {
			throw this.error('invalid argument name');
		}
		if (this.consume('}')) {
			return { type: 'argument', name };
		}
		this.expect(',');
		const kind = this.parseToken();
		switch (kind) {
			case 'number':
				if (this.consume('}')) {
					return { type: 'number', name };
				}
				throw this.error('number format styles are unsupported');
			case 'plural':
			case 'selectordinal': {
				this.expect(',');
				this.skipWs();
				let offset = 0;
				if (this.message.startsWith('offset:', this.pos)) {
					this.pos += 'offset:'.length;
					this.skipWs();
					let digits = '';
					while (/\d/.test(this.message[this.pos] ?? '')) {
						digits += this.message[this.pos++];
					}
					if (digits === '') {
						throw this.error('invalid plural offset');
					}
					offset = parseInt(digits, 10);
				}
				// `#` binds to this plural inside every branch, including nested selects.
				const options = this.parseOptions(true);
				this.expect('}');
				return {
					type: 'plural',
					name,
					offset,
					pluralType: kind === 'plural' ? 'cardinal' : 'ordinal',
					options,
				};
			}
			case 'select': {
				this.expect(',');
				// Select branches inherit the surrounding plural context for `#`.
				const options = this.parseOptions(inPlural);
				this.expect('}');
				return { type: 'select', name, options };
			}
			default:
				throw this.error(`unsupported argument type \`${kind}\``);
		}
	}

	private parseOptions(branchInPlural: boolean): Option[] {
		const options: Option[] = [];
		for (;;) {
			this.skipWs();
			if (this.pos >= this.message.length || this.message[this.pos] === '}') {
				break;
			}
			let key = '';
			while (
				this.pos < this.message.length &&
				!'{}'.includes(this.message[this.pos]) &&
				!/\s/.test(this.message[this.pos])
			) {
				key += this.message[this.pos++];
			}
			if (key === '') {
				throw this.error('invalid option selector');
			}
			this.skipWs();
			this.expect('{');
			const parts = this.parseParts(true, branchInPlural);
			this.expect('}');
			options.push(
				parts.every((p) => p.type === 'literal')
					? { key, text: parts.map((p) => (p as { value: string }).value).join(''), parts }
					: { key, text: null, parts },
			);
		}
		if (options.length === 0) {
			throw this.error('missing option selectors');
		}
		return options;
	}

	private parseToken(): string {
		let out = '';
		while (this.pos < this.message.length && !',}'.includes(this.message[this.pos])) {
			out += this.message[this.pos++];
		}
		return out.trim();
	}

	private consume(ch: string): boolean {
		if (this.message[this.pos] === ch) {
			this.pos++;
			return true;
		}
		return false;
	}

	private expect(ch: string): void {
		if (!this.consume(ch)) {
			throw this.error(`expected \`${ch}\``);
		}
	}

	private skipWs(): void {
		while (/\s/.test(this.message[this.pos] ?? '')) {
			this.pos++;
		}
	}
}

function renderParts(
	parts: Part[],
	args: Variables,
	formatter: MessageFormatter,
	pluralValue: number | undefined,
): string {
	let res = '';
	for (const part of parts) {
		switch (part.type) {
			case 'literal':
				res += part.value;
				break;
			case 'argument':
				// Matches the compiled `${args.name}` template hole (String coercion).
				res += String(args?.[part.name]);
				break;
			case 'number':
				res += formatter.number(args?.[part.name] as number);
				break;
			case 'pound':
				res += formatter.number(pluralValue as number);
				break;
			case 'plural': {
				const value =
					part.offset === 0
						? (args?.[part.name] as number)
						: (args?.[part.name] as number) - part.offset;
				res += formatter.plural(
					value,
					buildOptions(part.options, args, formatter, value),
					part.pluralType === 'cardinal' ? undefined : part.pluralType,
				);
				break;
			}
			case 'select':
				res += formatter.select(
					buildOptions(part.options, args, formatter, pluralValue),
					args?.[part.name] as string,
				);
				break;
		}
	}
	return res;
}

function buildOptions(
	options: Option[],
	args: Variables,
	formatter: MessageFormatter,
	pluralValue: number | undefined,
): Record<string, string | (() => string)> {
	const out: Record<string, string | (() => string)> = {};
	for (const option of options) {
		out[option.key] =
			option.text !== null
				? option.text
				: () => renderParts(option.parts, args, formatter, pluralValue);
	}
	return out;
}

export function compileString(message: string): LocalizedString {
	const parts = new MessageParser(message).parse();
	if (parts.every((p) => p.type === 'literal')) {
		// No arguments: stays a plain (de-quoted) string, like upstream's compiled output.
		return parts.map((p) => (p as { value: string }).value).join('');
	}
	return (args: Variables, formatter?: LocalizedStringFormatter<any, any>) =>
		renderParts(parts, args, formatter as unknown as MessageFormatter, undefined);
}

export function compileDictionaries(
	dictionaries: Record<string, Record<string, string>>,
): Record<string, Record<string, LocalizedString>> {
	const compiled: Record<string, Record<string, LocalizedString>> = {};
	for (const locale in dictionaries) {
		const strings = dictionaries[locale];
		const out: Record<string, LocalizedString> = {};
		for (const key in strings) {
			try {
				out[key] = compileString(strings[key]);
			} catch (e) {
				throw new Error(`Failed to compile intl message ${locale}/${key}: ${(e as Error).message}`);
			}
		}
		compiled[locale] = out;
	}
	return compiled;
}
