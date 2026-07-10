// Vendored from react-hook-form@7.81.0 src/useFormContext.tsx (octane port).
// Upstream's file holds both useFormContext and the FormProvider component;
// the component half lives in FormProvider.tsrx here (octane components with
// JSX are authored in .tsrx), and the shared contexts in useFormControlContext.
import { useContext } from 'octane';

import type { FieldValues, UseFormReturn } from './types';
import { HookFormContext } from './useFormControlContext';

/**
 * This custom hook allows you to access the form context. useFormContext is intended to be used in deeply nested structures, where it would become inconvenient to pass the context as a prop. To be used with {@link FormProvider}.
 *
 * @remarks
 * [API](https://react-hook-form.com/docs/useformcontext) • [Demo](https://codesandbox.io/s/react-hook-form-v7-form-context-ytudi)
 *
 * @returns return all useForm methods
 *
 * @example
 * ```tsx
 * function App() {
 *   const methods = useForm();
 *   const onSubmit = data => console.log(data);
 *
 *   return (
 *     <FormProvider {...methods} >
 *       <form onSubmit={methods.handleSubmit(onSubmit)}>
 *         <NestedInput />
 *         <input type="submit" />
 *       </form>
 *     </FormProvider>
 *   );
 * }
 *
 *  function NestedInput() {
 *   const { register } = useFormContext(); // retrieve all hook methods
 *   return <input {...register("test")} />;
 * }
 * ```
 */
export const useFormContext = <
	TFieldValues extends FieldValues,
	TContext = any,
	TTransformedValues = TFieldValues,
>(): UseFormReturn<TFieldValues, TContext, TTransformedValues> =>
	useContext(HookFormContext) as UseFormReturn<TFieldValues, TContext, TTransformedValues>;

export { FormProvider } from './FormProvider.tsrx';
