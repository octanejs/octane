import type {
	FieldElement,
	FormConfig,
	FormProps,
	FormSchema,
	SubmitEventHandler,
	SubmitHandler,
	ValidPath,
} from '@octanejs/formisch';
import type { GenericSchema } from 'valibot';

declare const schema: GenericSchema;
declare const config: FormConfig<FormSchema>;
declare const field: FieldElement;
declare const path: ValidPath<{ name: string }, ['name']>;
declare const submit: SubmitHandler<FormSchema>;
declare const eventSubmit: SubmitEventHandler<FormSchema>;
declare const formProps: FormProps;

void schema;
void config;
void field;
void path;
void submit;
void eventSubmit;
void formProps;

const validFormProps: FormProps = {
	of: formProps.of,
	onSubmit: eventSubmit,
	action: '/submit',
	method: 'post',
};

// @ts-expect-error Form props must reject attributes not supported by HTML forms.
const invalidFormProps: FormProps = { of: formProps.of, onSubmit: eventSubmit, madeUp: true };

void validFormProps;
void invalidFormProps;
