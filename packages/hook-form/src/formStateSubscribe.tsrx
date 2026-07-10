// Vendored from react-hook-form@7.81.0 src/formStateSubscribe.tsx (octane port).
// FormStateSubscribe component — render-prop subscription to form state.
// Authored as .tsrx (full compile) so the useFormState call is slot-wrapped
// (see controller.tsrx note).
import { useFormState } from './useFormState.ts';

export const FormStateSubscribe = (props) => {
	const { control, disabled, exact, name, render } = props;
	return render(useFormState({ control, name, disabled, exact }));
};
