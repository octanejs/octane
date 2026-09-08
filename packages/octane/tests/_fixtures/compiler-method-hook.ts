/** @jsxImportSource octane */
import { useState } from 'octane';
const store = {
	prefix: 'state:',
	useValue(value: string) {
		return useState(this.prefix + value);
	},
};
export function usePair() {
	return [store?.useValue('first'), store?.useValue('second')];
}

export function evaluateMethodSyntax() {
	const trace: string[] = [];
	const api = {
		prefix: 'store',
		get useValue() {
			trace.push('method');
			return function (this: { prefix: string }, value: string) {
				trace.push(this.prefix, String(arguments.length));
				return value;
			};
		},
	};
	function receiver() {
		trace.push('receiver');
		return api;
	}
	function argument() {
		trace.push('argument');
		return 'value';
	}
	function absent(): typeof api | null {
		return null;
	}
	const value = receiver().useValue(argument());
	const missing = absent()?.useValue(argument());
	const missingMethod: { useValue?: (value: string) => string } = {};
	missingMethod.useValue?.(argument());
	const failure = new Error('receiver failed');
	function throwingReceiver(): typeof api {
		throw failure;
	}
	let caught: unknown;
	try {
		throwingReceiver().useValue(argument());
	} catch (error) {
		caught = error;
	}
	// A failed method receiver must not change a subsequent call's arguments or this.
	const after = receiver().useValue(value);
	return { trace, value, missing, after, sameError: caught === failure };
}

export function evaluateOptionalMethodChain(present: boolean) {
	const trace: string[] = [];
	const result = {
		value: 'present',
		read() {
			trace.push('read');
			return this.value;
		},
	};
	const api = {
		useValue() {
			trace.push('method');
			return result;
		},
	};
	const store = present ? api : null;
	const value = store?.useValue().value;
	const call = store?.useValue().read();
	const optionalMethod = present ? api : { useValue: undefined };
	const optional = optionalMethod.useValue?.().value;
	return { value, call, optional, trace };
}

export function evaluateOptionalChainEdges() {
	const trace: string[] = [];
	const result = { value: 'present' };
	const fn = function (this: unknown, ...args: string[]) {
		trace.push(this === api ? 'this' : 'wrong this', ...args);
		return result;
	};
	Object.defineProperties(fn, {
		call: {
			get() {
				throw new Error('call property');
			},
		},
		bind: {
			get() {
				throw new Error('bind property');
			},
		},
	});
	const api = {
		get useValue() {
			trace.push('getter');
			return fn;
		},
	};
	function receiver() {
		trace.push('receiver');
		return api;
	}
	function argument() {
		trace.push('argument');
		return 'arg';
	}
	const value = receiver().useValue?.(...[argument()]).value;
	const absent = null as typeof api | null;
	const deleted = delete absent?.useValue().value;
	const item = {
		useValue() {
			return { value: 'removed' } as { value?: string };
		},
	};
	const removed = delete item?.useValue().value;
	function throws(operation: () => unknown) {
		try {
			operation();
			return false;
		} catch (error) {
			return error instanceof TypeError;
		}
	}
	// @ts-expect-error A present method returning undefined must still throw.
	const returnedUndefined = throws(() => ({ useValue() {} })?.useValue().value);
	// @ts-expect-error Optional access protects only the receiver.
	const missingChild = throws(() => ({ child: undefined })?.child.useValue());
	// @ts-expect-error Parentheses end the short-circuit region.
	const parenthesized = throws(() => (absent?.useValue()).value);
	const nested = absent?.useValue().value ?? receiver()?.useValue?.().value;
	return { value, deleted, removed, returnedUndefined, missingChild, parenthesized, nested, trace };
}
