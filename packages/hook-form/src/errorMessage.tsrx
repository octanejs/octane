// Adapted from react-hook-form@7.88.0 src/errorMessage.tsx for Octane.
import type { ElementType, OctaneNode } from 'octane';
import type { Control, FieldPath, FieldValues, Message, MultipleFieldErrors } from './types';
import { useFormState } from './useFormState';
import { get } from './utils';

export type ErrorMessageProps<TFieldValues extends FieldValues = FieldValues> = {
	as?: ElementType;
	control?: Control<TFieldValues>;
	name: FieldPath<TFieldValues> | `root.${string}` | 'root';
	render?: (data: { message: Message; messages?: MultipleFieldErrors }) => OctaneNode;
};

export function ErrorMessage<TFieldValues extends FieldValues = FieldValues>({
	as: Component,
	control,
	name,
	render,
}: ErrorMessageProps<TFieldValues>): OctaneNode {
	const { errors } = useFormState<TFieldValues>({ control, name: name as FieldPath<TFieldValues> });
	const error = get(errors, name);
	if (!error) return null;
	const message: string = error.message || '';
	if (render) return render({ message, messages: error.types });
	if (Component) return <Component>{message as string}</Component>;
	return message;
}
