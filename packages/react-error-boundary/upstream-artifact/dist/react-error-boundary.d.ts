import { Component } from 'react';
import { ComponentProps } from 'react';
import { ComponentRef } from 'react';
import { ComponentType } from 'react';
import { Context } from 'react';
import { ErrorInfo } from 'react';
import { ForwardRefExoticComponent } from 'react';
import { FunctionComponentElement } from 'react';
import { PropsWithChildren } from 'react';
import { PropsWithoutRef } from 'react';
import { ProviderProps } from 'react';
import { ReactNode } from 'react';
import { RefAttributes } from 'react';

/**
 * A reusable React [error boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) component.
 * Wrap this component around other React components to "catch" errors and render a fallback UI.
 *
 * Catches errors thrown while rendering the tree below it.
 *
 * Does not catch errors thrown during:
 * - Server side rendering
 * - Event handlers
 * - Errors thrown in the error boundary itself
 * - Async code that runs after rendering, like `setTimeout` callbacks or unresolved promises
 *
 * Event handler and async errors:
 *
 * - Use `useErrorBoundary` to pass caught errors to the nearest boundary
 * - In React 19, errors thrown from a function passed to the `startTransition` function returned by `useTransition`
 *   are caught by the nearest boundary
 *
 * ℹ️ The component provides several ways to render a fallback: `fallback`, `fallbackRender`, and `FallbackComponent`.
 * Refer to the documentation to determine which is best for your application.
 *
 * ℹ️ This is a **client component**. You can only pass props to it that are serializable or use it in files that have a `"use client";` directive.
 */
export declare class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps);
    static getDerivedStateFromError(error: Error): {
        didCatch: boolean;
        error: Error;
    };
    resetErrorBoundary(...args: unknown[]): void;
    componentDidCatch(error: unknown, info: ErrorInfo): void;
    componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void;
    render(): FunctionComponentElement<ProviderProps<ErrorBoundaryContextType | null>>;
}

export declare const ErrorBoundaryContext: Context<ErrorBoundaryContextType | null>;

export declare type ErrorBoundaryContextType = {
    didCatch: boolean;
    error: unknown | null;
    resetErrorBoundary: (...args: unknown[]) => void;
};

export declare type ErrorBoundaryProps = ErrorBoundaryPropsWithFallback | ErrorBoundaryPropsWithComponent | ErrorBoundaryPropsWithRender;

export declare type ErrorBoundaryPropsWithComponent = ErrorBoundarySharedProps & {
    fallback?: never;
    /**
     * React component responsible for returning a fallback UI based on a thrown value.
     *
     * ```tsx
     * <ErrorBoundary FallbackComponent={Fallback} />
     * ```
     */
    FallbackComponent: ComponentType<FallbackProps>;
    fallbackRender?: never;
};

export declare type ErrorBoundaryPropsWithFallback = ErrorBoundarySharedProps & {
    /**
     * Static content to render in place of an error if one is thrown.
     *
     * ```tsx
     * <ErrorBoundary fallback={<div className="text-red">Something went wrong</div>} />
     * ```
     */
    fallback: ReactNode;
    FallbackComponent?: never;
    fallbackRender?: never;
};

export declare type ErrorBoundaryPropsWithRender = ErrorBoundarySharedProps & {
    fallback?: never;
    FallbackComponent?: never;
    /**
     * [Render prop](https://react.dev/reference/react/Children#calling-a-render-prop-to-customize-rendering) function responsible for returning a fallback UI based on a thrown value.
     *
     * ```tsx
     * <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => <div>...</div>} />
     * ```
     */
    fallbackRender: (props: FallbackProps) => ReactNode;
};

declare type ErrorBoundarySharedProps = PropsWithChildren<{
    /**
     * Optional callback to enable e.g. logging error information to a server.
     *
     * @param error Value that was thrown; typically an instance of `Error`
     * @param info React "component stack" identifying where the error was thrown
     */
    onError?: (error: unknown, info: ErrorInfo) => void;
    /**
     * Optional callback to be notified when an error boundary is reset so React can retry the failed render.
     */
    onReset?: (details: {
        reason: "imperative-api";
        args: unknown[];
    } | {
        reason: "keys";
        prev: unknown[] | undefined;
        next: unknown[] | undefined;
    }) => void;
    /**
     * When changed, these keys will reset a triggered error boundary.
     * This can be useful when an error condition may be tied to some specific state (that can be uniquely identified by key).
     * See the documentation for examples of how to use this prop.
     */
    resetKeys?: unknown[];
}>;

declare type ErrorBoundaryState = {
    didCatch: true;
    error: unknown;
} | {
    didCatch: false;
    error: null;
};

export declare type FallbackProps = {
    error: unknown;
    resetErrorBoundary: (...args: unknown[]) => void;
};

export declare function getErrorMessage(thrown: unknown): string | undefined;

export declare type OnErrorCallback = (error: unknown, info: ErrorInfo) => void;

/**
 * Convenience hook for imperatively showing or dismissing error boundaries.
 *
 * ⚠️ This hook must only be used within an `ErrorBoundary` subtree.
 */
export declare function useErrorBoundary(): {
    /**
     * The currently visible `Error` (if one has been thrown).
     */
    error: unknown | null;
    /**
     * Method to reset and retry the nearest active error boundary (if one is active).
     */
    resetBoundary: () => void;
    /**
     * Trigger the nearest error boundary to display the error provided.
     *
     * ℹ️ React handles errors thrown while rendering.
     * Errors thrown in event handlers, or after async code has run, will not be caught automatically.
     * This method is a way to imperatively show the nearest error boundary for those errors.
     */
    showBoundary: (error: unknown) => void;
};

export declare type UseErrorBoundaryApi = {
    error: unknown | null;
    resetBoundary: () => void;
    showBoundary: (error: unknown) => void;
};

export declare function withErrorBoundary<Type extends ComponentType<any>>(Component: Type, errorBoundaryProps: ErrorBoundaryProps): ForwardRefExoticComponent<PropsWithoutRef<ComponentProps<Type>> & RefAttributes<ComponentRef<Type>>>;

export { }
