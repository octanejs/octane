import * as O from '@octanejs/hook-form';
import type * as U from 'react-hook-form';
import type { OctaneNode } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
// Framework-neutral types compare directly with the pinned declaration artifact.
// Native event/renderer surfaces are projected below and exercised with actual
// consumer calls; overloaded path helpers also retain the paired upstream tests.
type NativeInputProps<T> = { [K in keyof T as K extends 'onChange' ? 'onInput' : K]: T[K] };
type Values = { name: string; nested: { enabled: boolean }; items: { value: string }[] };

type Public_ControllerFieldState = Assert<Equal<O.ControllerFieldState, U.ControllerFieldState>>;
type Public_ControllerRenderProps = Assert<
	Equal<
		O.ControllerRenderProps<Values, 'name'>,
		NativeInputProps<U.ControllerRenderProps<Values, 'name'>>
	>
>;
type Public_UseControllerProps = Assert<
	Equal<
		Omit<O.UseControllerProps<Values, 'name'>, 'control'>,
		Omit<U.UseControllerProps<Values, 'name'>, 'control'>
	>
>;
type Public_UseControllerReturn = Assert<
	Equal<
		Omit<O.UseControllerReturn<Values, 'name'>, 'field'>,
		Omit<U.UseControllerReturn<Values, 'name'>, 'field'>
	>
>;
type Public_ControllerProps = Assert<
	Equal<Parameters<O.ControllerProps<Values, 'name'>['render']>[0]['field']['value'], string>
>;
type Public_Message = Assert<Equal<O.Message, U.Message>>;
type Public_MultipleFieldErrors = Assert<Equal<O.MultipleFieldErrors, U.MultipleFieldErrors>>;
type Public_FieldError = Assert<Equal<O.FieldError, U.FieldError>>;
type Public_ErrorOption = Assert<Equal<O.ErrorOption, U.ErrorOption>>;
type Public_DeepRequired = Assert<Equal<O.DeepRequired<Values>, U.DeepRequired<Values>>>;
type Public_FieldErrorsImpl = Assert<Equal<O.FieldErrorsImpl, U.FieldErrorsImpl>>;
type Public_GlobalError = Assert<Equal<O.GlobalError, U.GlobalError>>;
type Public_FieldErrors = Assert<Equal<O.FieldErrors, U.FieldErrors>>;
type Public_FieldPathError = Assert<
	Equal<O.FieldPathError<Values, 'name'>, U.FieldPathError<Values, 'name'>>
>;
type Public_InternalFieldErrors = Assert<Equal<O.InternalFieldErrors, U.InternalFieldErrors>>;
type Public_EventType = Assert<Equal<O.EventType, U.EventType>>;
type Public_UseFieldArrayProps = Assert<
	Equal<
		Omit<O.UseFieldArrayProps<Values, 'items'>, 'control'>,
		Omit<U.UseFieldArrayProps<Values, 'items'>, 'control'>
	>
>;
type Public_FieldArrayWithId = Assert<Equal<O.FieldArrayWithId, U.FieldArrayWithId>>;
type Public_FieldArrayMethodProps = Assert<Equal<O.FieldArrayMethodProps, U.FieldArrayMethodProps>>;
type Public_UseFieldArraySwap = Assert<Equal<O.UseFieldArraySwap, U.UseFieldArraySwap>>;
type Public_UseFieldArrayMove = Assert<Equal<O.UseFieldArrayMove, U.UseFieldArrayMove>>;
type Public_UseFieldArrayPrepend = Assert<
	Equal<O.UseFieldArrayPrepend<Values>, U.UseFieldArrayPrepend<Values>>
>;
type Public_UseFieldArrayAppend = Assert<
	Equal<O.UseFieldArrayAppend<Values>, U.UseFieldArrayAppend<Values>>
>;
type Public_UseFieldArrayRemove = Assert<Equal<O.UseFieldArrayRemove, U.UseFieldArrayRemove>>;
type Public_UseFieldArrayInsert = Assert<
	Equal<O.UseFieldArrayInsert<Values>, U.UseFieldArrayInsert<Values>>
>;
type Public_UseFieldArrayUpdate = Assert<
	Equal<O.UseFieldArrayUpdate<Values>, U.UseFieldArrayUpdate<Values>>
>;
type Public_UseFieldArrayReplace = Assert<
	Equal<O.UseFieldArrayReplace<Values>, U.UseFieldArrayReplace<Values>>
>;
type Public_UseFieldArrayReturn = Assert<Equal<O.UseFieldArrayReturn, U.UseFieldArrayReturn>>;
type Public_FieldArrayProps = Assert<
	Equal<
		Parameters<O.FieldArrayProps<Values, 'items'>['render']>[0],
		U.UseFieldArrayReturn<Values, 'items'>
	>
>;
type Public_InternalFieldName = Assert<Equal<O.InternalFieldName, U.InternalFieldName>>;
type Public_FieldName = Assert<Equal<O.FieldName<Values>, U.FieldName<Values>>>;
type Public_CustomElement = Assert<Equal<O.CustomElement<Values>, U.CustomElement<Values>>>;
type Public_FieldValue = Assert<Equal<O.FieldValue<Values>, U.FieldValue<Values>>>;
type Public_FieldValues = Assert<Equal<O.FieldValues, U.FieldValues>>;
type Public_NativeFieldValue = Assert<Equal<O.NativeFieldValue, U.NativeFieldValue>>;
type Public_FieldElement = Assert<Equal<O.FieldElement, U.FieldElement>>;
type Public_Ref = Assert<Equal<O.Ref, U.Ref>>;
type Public_Field = Assert<Equal<O.Field, U.Field>>;
type Public_FieldRefs = Assert<Equal<O.FieldRefs, U.FieldRefs>>;
type Public_NestedValue = Assert<
	Equal<O.NestedValue<Values>['items'], U.NestedValue<Values>['items']>
>;
type Public_DefaultValues = Assert<Equal<O.DefaultValues<Values>, U.DefaultValues<Values>>>;
type Public_InternalNameSet = Assert<Equal<O.InternalNameSet, U.InternalNameSet>>;
type Public_ValidationMode = Assert<Equal<O.ValidationMode, U.ValidationMode>>;
type Public_Mode = Assert<Equal<O.Mode, U.Mode>>;
type Public_ValidationModeFlags = Assert<Equal<O.ValidationModeFlags, U.ValidationModeFlags>>;
type Public_CriteriaMode = Assert<Equal<O.CriteriaMode, U.CriteriaMode>>;
type Public_SubmitHandler = Assert<
	Equal<
		Parameters<O.SubmitHandler<Values, number>>[0],
		Parameters<U.SubmitHandler<Values, number>>[0]
	>
>;
type Public_FormSubmitHandler = Assert<
	Equal<
		Omit<Parameters<O.FormSubmitHandler<Values>>[0], 'event'>,
		Omit<Parameters<U.FormSubmitHandler<Values>>[0], 'event'>
	>
>;
type Public_SubmitErrorHandler = Assert<
	Equal<Parameters<O.SubmitErrorHandler<Values>>[0], Parameters<U.SubmitErrorHandler<Values>>[0]>
>;
type Public_SetValueConfig = Assert<Equal<O.SetValueConfig, U.SetValueConfig>>;
type Public_TriggerConfig = Assert<Equal<O.TriggerConfig, U.TriggerConfig>>;
type Public_ResetFieldConfig = Assert<
	Equal<O.ResetFieldConfig<Values>, U.ResetFieldConfig<Values>>
>;
type Public_ChangeHandler = Assert<Equal<O.ChangeHandler, U.ChangeHandler>>;
type Public_DelayCallback = Assert<Equal<O.DelayCallback, U.DelayCallback>>;
type Public_UseFormProps = Assert<
	Equal<Omit<O.UseFormProps<Values>, 'formControl'>, Omit<U.UseFormProps<Values>, 'formControl'>>
>;
type Public_FieldNamesMarkedBoolean = Assert<
	Equal<O.FieldNamesMarkedBoolean<Values>, U.FieldNamesMarkedBoolean<Values>>
>;
type Public_FormStateProxy = Assert<Equal<O.FormStateProxy, U.FormStateProxy>>;
type Public_ReadFormState = Assert<Equal<O.ReadFormState, U.ReadFormState>>;
type Public_KeepStateOptions = Assert<Equal<O.KeepStateOptions, U.KeepStateOptions>>;
type Public_SetFieldValue = Assert<Equal<O.SetFieldValue<Values>, U.SetFieldValue<Values>>>;
type Public_RefCallBack = Assert<Equal<O.RefCallBack, U.RefCallBack>>;
type Public_UseFormRegisterReturn = Assert<
	Equal<O.UseFormRegisterReturn<'name'>, NativeInputProps<U.UseFormRegisterReturn<'name'>>>
>;
type Public_UseFormRegister = Assert<
	Equal<ReturnType<O.UseFormRegister<Values>>['name'], U.FieldPath<Values>>
>;
type Public_SetFocusOptions = Assert<Equal<O.SetFocusOptions, U.SetFocusOptions>>;
type Public_UseFormSetFocus = Assert<Equal<O.UseFormSetFocus<Values>, U.UseFormSetFocus<Values>>>;
type Public_GetValuesConfig = Assert<Equal<O.GetValuesConfig, U.GetValuesConfig>>;
type Public_UseFormGetValues = Assert<
	Equal<ReturnType<O.UseFormGetValues<Values>>, ReturnType<U.UseFormGetValues<Values>>>
>;
type Public_ErrorNamespacePath = Assert<Equal<O.ErrorNamespacePath, U.ErrorNamespacePath>>;
type Public_GetErrorsResult = Assert<
	Equal<O.GetErrorsResult<Values, 'name'>, U.GetErrorsResult<Values, 'name'>>
>;
type Public_UseFormGetErrors = Assert<
	Equal<ReturnType<O.UseFormGetErrors<Values>>, ReturnType<U.UseFormGetErrors<Values>>>
>;
type Public_UseFormGetFieldState = Assert<
	Equal<ReturnType<O.UseFormGetFieldState<Values>>, ReturnType<U.UseFormGetFieldState<Values>>>
>;
type Public_UseFormSubscribe = Assert<
	Equal<O.UseFormSubscribe<Values>, U.UseFormSubscribe<Values>>
>;
type Public_UseFormWatch = Assert<
	Equal<ReturnType<O.UseFormWatch<Values>>, ReturnType<U.UseFormWatch<Values>>>
>;
type Public_UseFormTrigger = Assert<Equal<O.UseFormTrigger<Values>, U.UseFormTrigger<Values>>>;
type Public_UseFormClearErrors = Assert<
	Equal<O.UseFormClearErrors<Values>, U.UseFormClearErrors<Values>>
>;
type Public_UseFormSetValue = Assert<
	Equal<Parameters<O.UseFormSetValue<Values>>, Parameters<U.UseFormSetValue<Values>>>
>;
type Public_UseFormSetValues = Assert<
	Equal<O.UseFormSetValues<Values>, U.UseFormSetValues<Values>>
>;
type Public_UseFormSetError = Assert<Equal<O.UseFormSetError<Values>, U.UseFormSetError<Values>>>;
type Public_UseFormUnregister = Assert<
	Equal<O.UseFormUnregister<Values>, U.UseFormUnregister<Values>>
>;
type Public_UseFormHandleSubmit = Assert<
	Equal<
		ReturnType<ReturnType<O.UseFormHandleSubmit<Values>>>,
		ReturnType<ReturnType<U.UseFormHandleSubmit<Values>>>
	>
>;
type Public_UseFormResetField = Assert<
	Equal<Parameters<O.UseFormResetField<Values>>, Parameters<U.UseFormResetField<Values>>>
>;
type Public_UseFormReset = Assert<Equal<O.UseFormReset<Values>, U.UseFormReset<Values>>>;
type Public_UseFormResetDefaultValues = Assert<
	Equal<O.UseFormResetDefaultValues<Values>, U.UseFormResetDefaultValues<Values>>
>;
type Public_WatchInternal = Assert<Equal<O.WatchInternal<Values>, U.WatchInternal<Values>>>;
type Public_GetIsDirty = Assert<Equal<O.GetIsDirty, U.GetIsDirty>>;
type Public_FormStateSubjectRef = Assert<
	Equal<O.FormStateSubjectRef<Values>, U.FormStateSubjectRef<Values>>
>;
type Public_Subjects = Assert<Equal<O.Subjects, U.Subjects>>;
type Public_Names = Assert<Equal<O.Names, U.Names>>;
type Public_BatchFieldArrayUpdate = Assert<
	Equal<Parameters<O.BatchFieldArrayUpdate>, Parameters<U.BatchFieldArrayUpdate>>
>;
type Public_FromSubscribe = Assert<Equal<O.FromSubscribe<Values>, U.FromSubscribe<Values>>>;
type Public_Control = Assert<
	Equal<O.Control<Values>['_formState'], U.Control<Values>['_formState']>
>;
type Public_WatchObserver = Assert<Equal<O.WatchObserver<Values>, U.WatchObserver<Values>>>;
type Public_UseFormReturn = Assert<
	Equal<O.UseFormReturn<Values>['formState'], U.UseFormReturn<Values>['formState']>
>;
type Public_UseFormStateProps = Assert<
	Equal<Omit<O.UseFormStateProps<Values>, 'control'>, Omit<U.UseFormStateProps<Values>, 'control'>>
>;
type Public_UseFormStateReturn = Assert<
	Equal<O.UseFormStateReturn<Values>, U.UseFormStateReturn<Values>>
>;
type Public_FormProviderProps = Assert<Equal<O.FormProviderProps<Values>['children'], OctaneNode>>;
type Public_FormProps = Assert<
	Equal<
		Pick<
			O.FormProps<Values>,
			'headers' | 'validateStatus' | 'onSuccess' | 'onError' | 'method' | 'encType'
		>,
		Pick<
			U.FormProps<Values>,
			'headers' | 'validateStatus' | 'onSuccess' | 'onError' | 'method' | 'encType'
		>
	>
>;
type Public_PathString = Assert<Equal<O.PathString, U.PathString>>;
type Public_ArrayPath = Assert<Equal<O.ArrayPath<Values>, U.ArrayPath<Values>>>;
type Public_FieldArrayPath = Assert<Equal<O.FieldArrayPath<Values>, U.FieldArrayPath<Values>>>;
type Public_FieldArrayPathByValue = Assert<
	Equal<O.FieldArrayPathByValue<Values, string>, U.FieldArrayPathByValue<Values, string>>
>;
type Public_FieldArrayPathValue = Assert<
	Equal<O.FieldArrayPathValue<Values, 'items'>, U.FieldArrayPathValue<Values, 'items'>>
>;
type Public_FieldPath = Assert<Equal<O.FieldPath<Values>, U.FieldPath<Values>>>;
type Public_FieldPathByValue = Assert<
	Equal<O.FieldPathByValue<Values, string>, U.FieldPathByValue<Values, string>>
>;
type Public_FieldPathValue = Assert<
	Equal<O.FieldPathValue<Values, 'name'>, U.FieldPathValue<Values, 'name'>>
>;
type Public_FieldPathValues = Assert<
	Equal<
		O.FieldPathValues<Values, ['name', 'nested.enabled']>,
		U.FieldPathValues<Values, ['name', 'nested.enabled']>
	>
>;
type Public_Path = Assert<Equal<O.Path<Values>, U.Path<Values>>>;
type Public_PathValue = Assert<Equal<O.PathValue<Values, 'name'>, U.PathValue<Values, 'name'>>>;
type Public_ResolverSuccess = Assert<Equal<O.ResolverSuccess<Values>, U.ResolverSuccess<Values>>>;
type Public_ResolverError = Assert<Equal<O.ResolverError, U.ResolverError>>;
type Public_ResolverResult = Assert<Equal<O.ResolverResult, U.ResolverResult>>;
type Public_ResolverOptions = Assert<Equal<O.ResolverOptions<Values>, U.ResolverOptions<Values>>>;
type Public_Resolver = Assert<Equal<O.Resolver, U.Resolver>>;
type Public_Noop = Assert<Equal<O.Noop, U.Noop>>;
type Public_Primitive = Assert<Equal<O.Primitive, U.Primitive>>;
type Public_BrowserNativeObject = Assert<Equal<O.BrowserNativeObject, U.BrowserNativeObject>>;
type Public_OpaqueTypes = Assert<Equal<O.OpaqueTypes, U.OpaqueTypes>>;
type Public_OpaqueType = Assert<Equal<O.OpaqueType, U.OpaqueType>>;
type Public_EmptyObject = Assert<Equal<O.EmptyObject, U.EmptyObject>>;
type Public_NonUndefined = Assert<
	Equal<O.NonUndefined<'value' | undefined>, U.NonUndefined<'value' | undefined>>
>;
type Public_LiteralUnion = Assert<
	Equal<O.LiteralUnion<'known', string>, U.LiteralUnion<'known', string>>
>;
type Public_ExtractObjects = Assert<Equal<O.ExtractObjects<Values>, U.ExtractObjects<Values>>>;
type Public_DeepPartial = Assert<Equal<O.DeepPartial<Values>, U.DeepPartial<Values>>>;
type Public_DeepPartialSkipArrayKey = Assert<
	Equal<O.DeepPartialSkipArrayKey<Values>, U.DeepPartialSkipArrayKey<Values>>
>;
type Public_IsAny = Assert<Equal<O.IsAny<Values>, U.IsAny<Values>>>;
type Public_IsNever = Assert<Equal<O.IsNever<Values>, U.IsNever<Values>>>;
type Public_IsEqual = Assert<Equal<O.IsEqual<string, string>, U.IsEqual<string, string>>>;
type Public_DeepMap = Assert<Equal<O.DeepMap<Values, boolean>, U.DeepMap<Values, boolean>>>;
type Public_IsFlatObject = Assert<Equal<O.IsFlatObject<Values>, U.IsFlatObject<Values>>>;
type Public_Merge = Assert<
	Equal<
		O.Merge<{ first: string }, { second: number }>,
		U.Merge<{ first: string }, { second: number }>
	>
>;
type Public_ValidationValue = Assert<Equal<O.ValidationValue, U.ValidationValue>>;
type Public_ValidationRule = Assert<Equal<O.ValidationRule, U.ValidationRule>>;
type Public_ValidationValueMessage = Assert<
	Equal<O.ValidationValueMessage, U.ValidationValueMessage>
>;
type Public_ValidateResult = Assert<Equal<O.ValidateResult, U.ValidateResult>>;
type Public_FormValidateResult = Assert<
	Equal<O.FormValidateResult<Values>, U.FormValidateResult<Values>>
>;
type Public_Validate = Assert<Equal<O.Validate<string, Values>, U.Validate<string, Values>>>;
type Public_ValidateFormEventType = Assert<Equal<O.ValidateFormEventType, U.ValidateFormEventType>>;
type Public_ValidateForm = Assert<Equal<O.ValidateForm<Values>, U.ValidateForm<Values>>>;
type Public_RegisterOptions = Assert<Equal<O.RegisterOptions, U.RegisterOptions>>;
type Public_InputValidationRules = Assert<Equal<O.InputValidationRules, U.InputValidationRules>>;
type Public_MaxType = Assert<Equal<O.MaxType, U.MaxType>>;
type Public_MinType = Assert<Equal<O.MinType, U.MinType>>;
type Public_UseWatchProps = Assert<
	Equal<Omit<O.UseWatchProps<Values>, 'control'>, Omit<U.UseWatchProps<Values>, 'control'>>
>;
type Public_WatchDefaultValue = Assert<
	Equal<O.WatchDefaultValue<'name'>, U.WatchDefaultValue<'name'>>
>;
type Public_WatchName = Assert<Equal<O.WatchName<Values>, U.WatchName<Values>>>;
type Public_WatchValue = Assert<Equal<O.WatchValue<'name'>, U.WatchValue<'name'>>>;
type Public_WatchRenderValue = Assert<
	Equal<O.WatchRenderValue<'name', Values, string>, U.WatchRenderValue<'name', Values, string>>
>;
type Public_WatchProps = Assert<
	Equal<
		Omit<O.WatchProps<'name', Values>, 'control' | 'render'>,
		Omit<U.WatchProps<'name', Values>, 'control' | 'render'>
	>
>;

const methods = O.useForm<Values>({
	defaultValues: { name: '', nested: { enabled: false }, items: [] },
});
const registered = methods.register('name', { required: true });
type RegisterInput = Assert<Equal<typeof registered.onInput, O.ChangeHandler>>;
const namedError = methods.getErrors('name');
type ErrorResult = Assert<Equal<typeof namedError, O.FieldPathError<Values, 'name'> | undefined>>;
type ErrorMessageResult = Assert<Equal<ReturnType<typeof O.ErrorMessage<Values>>, OctaneNode>>;
type FieldArrayResult = Assert<Equal<ReturnType<typeof O.FieldArray<Values, 'items'>>, OctaneNode>>;
type FormStateResult = Assert<Equal<ReturnType<typeof O.FormState<Values>>, OctaneNode>>;
type FormStateAliasResult = Assert<
	Equal<ReturnType<typeof O.FormStateSubscribe<Values>>, OctaneNode>
>;
type FormResult = Assert<Equal<ReturnType<typeof O.Form<Values>>, OctaneNode>>;
type ControllerResult = Assert<Equal<ReturnType<typeof O.Controller<Values, 'name'>>, OctaneNode>>;
type ProviderProps = Assert<
	Equal<Parameters<typeof O.FormProvider<Values>>[0]['getErrors'], O.UseFormGetErrors<Values>>
>;
type FormValues = Assert<
	Equal<ReturnType<typeof O.useForm<Values>>['getValues'], O.UseFormGetValues<Values>>
>;
type ContextValues = Assert<
	Equal<ReturnType<typeof O.useFormContext<Values>>['getValues'], O.UseFormGetValues<Values>>
>;
type ControlledValue = Assert<
	Equal<ReturnType<typeof O.useController<Values, 'name'>>['field']['value'], string>
>;
type ArrayFields = Assert<
	Equal<ReturnType<typeof O.useFieldArray<Values, 'items'>>['fields'][number]['value'], string>
>;
type DirtyState = Assert<Equal<ReturnType<typeof O.useFormState<Values>>['isDirty'], boolean>>;
const watchedName = O.useWatch({ control: methods.control, name: 'name' });
type WatchedName = Assert<Equal<typeof watchedName, string>>;
type WatchResult = Assert<Equal<ReturnType<typeof O.Watch<Values, 'name'>>, OctaneNode>>;
type AppendErrorsResult = Assert<
	Equal<ReturnType<typeof O.appendErrors>, ReturnType<typeof U.appendErrors>>
>;
type ControlValues = Assert<
	Equal<ReturnType<typeof O.createFormControl<Values>>['getValues'], O.UseFormGetValues<Values>>
>;
type GetResult = Assert<Equal<typeof O.get, typeof U.get>>;
type SetResult = Assert<Equal<typeof O.set, typeof U.set>>;
methods.setValue('name', 'next');
methods.getErrors('nested.enabled');
O.ErrorMessage<Values>({ control: methods.control, name: 'name', as: 'span' });
O.FieldArray<Values, 'items'>({
	control: methods.control,
	name: 'items',
	render: ({ fields }) => fields[0]?.value ?? '',
});
// @ts-expect-error form paths retain their declared fields
methods.setValue('missing', 'value');
// @ts-expect-error field values retain their declared type
methods.setValue('name', 42);
// @ts-expect-error the error display requires an existing field or root namespace
O.ErrorMessage<Values>({ name: 'missing' });
// @ts-expect-error array bindings require an array-valued field
O.useFieldArray<Values>({ control: methods.control, name: 'name' });

// Concrete calls protect generic overload inference independently of alias identity.
declare const upstreamMethods: U.UseFormReturn<Values>;
const allValues = methods.getValues();
const nameValue = methods.getValues('name');
const tupleValues = methods.getValues(['name', 'nested.enabled']);
const allErrors = methods.getErrors();
const errorTuple = methods.getErrors(['name', 'root.server']);
const upstreamErrorTuple = upstreamMethods.getErrors(['name', 'root.server']);
type AllValues = Assert<Equal<typeof allValues, Values>>;
type NameValue = Assert<Equal<typeof nameValue, string>>;
type TupleValues = Assert<Equal<typeof tupleValues, [string, boolean]>>;
type AllErrors = Assert<Equal<typeof allErrors, U.FieldErrors<Values>>>;
type ErrorTuple = Assert<Equal<typeof errorTuple, typeof upstreamErrorTuple>>;
const submission = methods.handleSubmit(({ name }) => name.length)(new Event('submit'));
type SubmitReturn = Assert<Equal<typeof submission, Promise<number | undefined>>>;
const asyncSubmission = methods.handleSubmit(async ({ name }) => ({ length: name.length }))();
type AsyncSubmitReturn = Assert<
	Equal<typeof asyncSubmission, Promise<{ length: number } | undefined>>
>;
const watchedTuple = methods.watch(['name', 'nested.enabled']);
type WatchedTuple = Assert<Equal<typeof watchedTuple, [string, boolean]>>;
methods.resetField('name', { defaultValue: 'reset' });
// @ts-expect-error reset defaults retain their field value type
methods.resetField('name', { defaultValue: 42 });
type ErrorMessageName = Assert<
	Equal<O.ErrorMessageProps<Values>['name'], U.FieldPath<Values> | 'root' | `root.${string}`>
>;
type ErrorMessageRender = Assert<
	Equal<
		Parameters<NonNullable<O.ErrorMessageProps<Values>['render']>>[0],
		{ message: U.Message; messages?: U.MultipleFieldErrors }
	>
>;
type StateRender = Assert<
	Equal<Parameters<O.FormStateProps<Values>['render']>[0], U.FormState<Values>>
>;
type StateAliasProps = Assert<Equal<O.FormStateSubscribeProps<Values>, O.FormStateProps<Values>>>;
type StateType = Assert<Equal<O.FormState<Values>, U.FormState<Values>>>;
type ArrayType = Assert<Equal<O.FieldArray<Values, 'items'>, U.FieldArray<Values, 'items'>>>;

type SubscribePropsRender = Assert<
	Equal<Parameters<O.FormStateSubscribeProps<Values>['render']>[0], U.FormState<Values>>
>;
type CreatedControlFocus = Assert<
	Equal<ReturnType<ReturnType<typeof O.createFormControl<Values>>['setFocus']>, void>
>;
type FormStateSnapshot = Assert<
	Equal<ReturnType<typeof O.useForm<Values>>['formState'], U.FormState<Values>>
>;
type ContextStateSnapshot = Assert<
	Equal<ReturnType<typeof O.useFormContext<Values>>['formState'], U.FormState<Values>>
>;
type WatchDefaultSnapshot = Assert<
	Equal<ReturnType<typeof O.useWatch<Values>>, ReturnType<typeof U.useWatch<Values>>>
>;

type ProviderStateSnapshot = Assert<
	Equal<Parameters<typeof O.FormProvider<Values>>[0]['formState'], U.FormState<Values>>
>;
