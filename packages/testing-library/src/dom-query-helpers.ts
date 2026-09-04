import * as dom from '@testing-library/dom';
import type { GetErrorFunction, QueryMethod, Variant, waitForOptions } from '@testing-library/dom';

// DOM Testing Library 10.4.1 exports these values but omits their declarations.
// Preserve the original functions and describe their pinned query contracts.
interface RuntimeQueryHelpers {
	getMultipleElementsFoundError(message: string, container: Element): Error;
	makeSingleQuery<Args extends unknown[], ElementType extends HTMLElement>(
		query: QueryMethod<Args, ElementType[]>,
		getMultipleError: GetErrorFunction<Args>,
	): QueryMethod<Args, ElementType | null>;
	makeGetAllQuery<Args extends unknown[], ElementType extends HTMLElement>(
		query: QueryMethod<Args, ElementType[]>,
		getMissingError: GetErrorFunction<Args>,
	): QueryMethod<Args, ElementType[]>;
	makeFindQuery<Text, Options, Result>(
		query: (container: HTMLElement, text: Text, options?: Options) => Result,
	): (
		container: HTMLElement,
		text: Text,
		options?: Options,
		waitOptions?: waitForOptions,
	) => Promise<Awaited<Result>>;
	wrapSingleQueryWithSuggestion<Args extends unknown[], Result extends HTMLElement | null>(
		query: QueryMethod<Args, Result>,
		queryName: string,
		variant: Variant,
	): QueryMethod<Args, Result>;
	wrapAllByQueryWithSuggestion<Args extends unknown[], ElementType extends HTMLElement>(
		query: QueryMethod<Args, ElementType[]>,
		queryName: string,
		variant: Variant,
	): QueryMethod<Args, ElementType[]>;
}

export const {
	getMultipleElementsFoundError,
	makeSingleQuery,
	makeGetAllQuery,
	makeFindQuery,
	wrapSingleQueryWithSuggestion,
	wrapAllByQueryWithSuggestion,
} = dom as typeof dom & RuntimeQueryHelpers;

export const queryHelpers = dom.queryHelpers as typeof dom.queryHelpers & RuntimeQueryHelpers;
