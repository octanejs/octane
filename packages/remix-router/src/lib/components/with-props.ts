// UNSAFE_With*Props wrappers — transcribed from react-router@7.18.1
// lib/components.tsx. Used by framework-mode codegen upstream; exported here
// for surface parity. Plain .ts: cloneElement/createElement over descriptors.
import { cloneElement, createElement } from 'octane';
import { useActionData, useLoaderData, useMatches, useParams } from '../hooks';

function useRouteComponentProps() {
	return {
		params: useParams(),
		loaderData: useLoaderData(),
		actionData: useActionData(),
		matches: useMatches(),
	};
}

export type RouteComponentProps = ReturnType<typeof useRouteComponentProps>;

export function WithComponentProps(props: { children: any }) {
	const routeProps = useRouteComponentProps();
	return cloneElement(props.children, routeProps);
}

export function withComponentProps(Component: any) {
	return function WithComponentProps() {
		const routeProps = useRouteComponentProps();
		return createElement(Component, routeProps);
	};
}

function useHydrateFallbackProps() {
	return {
		params: useParams(),
		loaderData: useLoaderData(),
		actionData: useActionData(),
	};
}

export type HydrateFallbackProps = ReturnType<typeof useHydrateFallbackProps>;

export function WithHydrateFallbackProps(props: { children: any }) {
	const routeProps = useHydrateFallbackProps();
	return cloneElement(props.children, routeProps);
}

export function withHydrateFallbackProps(HydrateFallback: any) {
	return function WithHydrateFallbackProps() {
		const routeProps = useHydrateFallbackProps();
		return createElement(HydrateFallback, routeProps);
	};
}

function useErrorBoundaryProps() {
	return {
		params: useParams(),
		loaderData: useLoaderData(),
		actionData: useActionData(),
	};
}

export type ErrorBoundaryProps = ReturnType<typeof useErrorBoundaryProps>;

export function WithErrorBoundaryProps(props: { children: any }) {
	const routeProps = useErrorBoundaryProps();
	return cloneElement(props.children, routeProps);
}

export function withErrorBoundaryProps(ErrorBoundary: any) {
	return function WithErrorBoundaryProps() {
		const routeProps = useErrorBoundaryProps();
		return createElement(ErrorBoundary, routeProps);
	};
}
