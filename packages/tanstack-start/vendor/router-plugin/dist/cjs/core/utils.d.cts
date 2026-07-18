import { default as babel } from '@babel/core';
import * as t from '@babel/types';
export declare const debug: boolean | "" | undefined;
/**
 * Normalizes a file path by converting Windows backslashes to forward slashes.
 * This ensures consistent path handling across different bundlers and operating systems.
 *
 * The route generator stores paths with forward slashes, but rspack/webpack on Windows
 * pass native paths with backslashes to transform handlers.
 */
export declare function normalizePath(path: string): string;
export declare const routeFactoryCallCodeFilter: RegExp[];
export declare function getObjectPropertyKeyName(prop: t.ObjectProperty): string | undefined;
export declare function getUniqueProgramIdentifier(programPath: babel.NodePath<t.Program>, baseName: string): t.Identifier;
