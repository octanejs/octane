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

export function wizardReducer(state: WizardState, _action: WizardAction): WizardState {
	return state;
}

export function ProfileStep(props: {
	name: string;
	onName: (name: string) => void;
	onNext: () => void;
}) @{
	<form aria-label="Profile step">
		<label for="wizard-name">Name</label>
		<input id="wizard-name" value={props.name} />
		<button type="submit">Choose plan</button>
	</form>
}

export function PlanStep(props: {
	plan: Plan;
	onPlan: (plan: Plan) => void;
	onBack: () => void;
	onNext: () => void;
}) @{
	<form aria-label="Plan step">
		<label for="wizard-plan">Plan</label>
		<select id="wizard-plan" value={props.plan}>
			<option value="starter">Starter</option>
			<option value="pro">Pro</option>
		</select>
		<button type="button">Back</button>
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
		<output aria-label="Review name">{props.name as string}</output>
		<output aria-label="Review plan">{props.plan as string}</output>
		<button>Back</button>
		<button>Confirm</button>
	</section>
}

export function App(props: { onConfirm: (confirmation: Confirmation) => void }) @{
	<main>
		<h1>Account wizard</h1>
		<ProfileStep name="" onName={() => {}} onNext={() => {}} />
	</main>
}
