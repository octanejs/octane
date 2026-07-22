import { default as babel } from '@babel/core';
import * as t from '@babel/types';
export declare function codeFrameError(
	code: string,
	loc: {
		start: {
			line: number;
			column: number;
		};
		end: {
			line: number;
			column: number;
		};
	},
	message: string,
): Error;
/**
 * Converts a bundler module ID to its physical-file identity for diagnostics,
 * filesystem matching, and file-based invalidation.
 *
 * Do not use this for IDs passed to resolve/load hooks or as module cache keys:
 * virtual prefixes and queries can be part of the module's semantic identity.
 */
export declare function cleanId(id: string): string;
/**
 * Strips a method call by replacing it with its callee object.
 * E.g., `foo().bar()` -> `foo()`
 *
 * This is a common pattern used when removing method calls from chains
 * (e.g., removing .server() from middleware on client, or .validator() on client).
 *
 * @param callPath - The path to the CallExpression to strip
 */
export declare function stripMethodCall(callPath: babel.NodePath<t.CallExpression>): void;
