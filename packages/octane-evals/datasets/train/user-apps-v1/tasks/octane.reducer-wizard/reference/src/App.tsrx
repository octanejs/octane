import { useReducer } from 'octane';

export type Plan = 'starter' | 'pro';

export interface WizardState {
	step: 'profile' | 'plan' | 'review';
	name: string;
	plan: Plan;
}

export type WizardAction =
	| { type: 'set-name'; value: string }
	| { type: 'set-plan'; value: Plan }
	| { type: 'next' }
	| { type: 'back' };

export interface Confirmation {
	name: string;
	plan: Plan;
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
	switch (action.type) {
		case 'set-name':
			return { ...state, name: action.value };
		case 'set-plan':
			return { ...state, plan: action.value };
		case 'next':
			if (state.step === 'profile') return { ...state, step: 'plan' };
			if (state.step === 'plan') return { ...state, step: 'review' };
			return state;
		case 'back':
			if (state.step === 'review') return { ...state, step: 'plan' };
			if (state.step === 'plan') return { ...state, step: 'profile' };
			return state;
	}
}

export function ProfileStep(props: {
	name: string;
	onName: (name: string) => void;
	onNext: () => void;
}) @{
	const valid = props.name.trim() !== '';

	<form
		aria-label="Profile step"
		onSubmit={(event: SubmitEvent) => {
			event.preventDefault();
			if (valid) props.onNext();
		}}
	>
		<label for="wizard-name">Name</label>
		<input
			id="wizard-name"
			value={props.name}
			onInput={(event: InputEvent) => props.onName((event.target as HTMLInputElement).value)}
		/>
		<button type="submit" disabled={!valid}>Choose plan</button>
	</form>
}

export function PlanStep(props: {
	plan: Plan;
	onPlan: (plan: Plan) => void;
	onBack: () => void;
	onNext: () => void;
}) @{
	<form
		aria-label="Plan step"
		onSubmit={(event: SubmitEvent) => {
			event.preventDefault();
			props.onNext();
		}}
	>
		<label for="wizard-plan">Plan</label>
		<select
			id="wizard-plan"
			value={props.plan}
			onChange={(event: Event) => props.onPlan((event.target as HTMLSelectElement).value as Plan)}
		>
			<option value="starter">Starter</option>
			<option value="pro">Pro</option>
		</select>
		<button type="button" onClick={props.onBack}>Back</button>
		<button type="submit">Review</button>
	</form>
}

export function ReviewStep(props: {
	name: string;
	plan: Plan;
	onBack: () => void;
	onConfirm: () => void;
}) @{
	<section aria-label="Review step">
		<output aria-label="Review name">
			{props.name.trim() as string}
		</output>
		<output aria-label="Review plan">
			{props.plan === 'starter' ? 'Starter' : 'Pro'}
		</output>
		<button type="button" onClick={props.onBack}>Back</button>
		<button type="button" onClick={props.onConfirm}>Confirm</button>
	</section>
}

export function App(props: { onConfirm: (confirmation: Confirmation) => void }) @{
	const [state, dispatch] = useReducer(
		wizardReducer,
		{
			step: 'profile',
			name: '',
			plan: 'starter',
		} as WizardState,
	);

	<main>
		<h1>Account wizard</h1>
		@switch (state.step) {
			@case 'profile': {
				<ProfileStep
					name={state.name}
					onName={(name) => dispatch({ type: 'set-name', value: name })}
					onNext={() => dispatch({ type: 'next' })}
				/>
			}
			@case 'plan': {
				<PlanStep
					plan={state.plan}
					onPlan={(plan) => dispatch({ type: 'set-plan', value: plan })}
					onBack={() => dispatch({ type: 'back' })}
					onNext={() => dispatch({ type: 'next' })}
				/>
			}
			@case 'review': {
				<ReviewStep
					name={state.name}
					plan={state.plan}
					onBack={() => dispatch({ type: 'back' })}
					onConfirm={() => props.onConfirm({ name: state.name.trim(), plan: state.plan })}
				/>
			}
		}
	</main>
}
