/**
 * Shared React-shaped form authoring diagnostics. Callers provide the final
 * native-host prop snapshot so source evaluation and observable DOM behavior
 * stay untouched; both runtimes invoke this helper only from DEV-only paths.
 */
export interface FormAuthoringDiagnostic {
	kind: string;
	message: string;
}

export function formAuthoringDiagnostics(
	tag: string,
	props: Record<string, unknown>,
	children?: unknown,
): FormAuthoringDiagnostic[] {
	const diagnostics: FormAuthoringDiagnostic[] = [];
	if (tag === 'input' || tag === 'textarea' || tag === 'select') {
		if (props.value !== undefined && props.defaultValue !== undefined) {
			diagnostics.push({
				kind: 'value-default',
				message:
					`A <${tag}> has both \`value\` and \`defaultValue\` props. ` +
					`A form field must be either controlled or uncontrolled; remove one of these props.`,
			});
		}
		if (tag === 'input' && props.checked !== undefined && props.defaultChecked !== undefined) {
			diagnostics.push({
				kind: 'checked-default',
				message:
					'A <input> has both `checked` and `defaultChecked` props. ' +
					'A form field must be either controlled or uncontrolled; remove one of these props.',
			});
		}
	}

	if (tag === 'textarea' && children != null && props.value == null) {
		diagnostics.push({
			kind: 'textarea-children',
			message: 'Use `defaultValue` or `value` instead of children on <textarea>.',
		});
	}

	if (tag === 'option') {
		if (props.selected != null) {
			diagnostics.push({
				kind: 'option-selected',
				message: 'Use `value` or `defaultValue` on <select> instead of `selected` on <option>.',
			});
		}
		if (
			props.value == null &&
			children !== undefined &&
			typeof children === 'object' &&
			children !== null
		) {
			diagnostics.push({
				kind: 'option-children',
				message:
					'Cannot infer an <option> value from complex children. ' +
					'Pass an explicit `value` prop or use plain text children.',
			});
		}
	}

	const action = tag === 'form' ? props.action : (props.formAction ?? props.formaction);
	if (action == null) return diagnostics;
	if (tag === 'input') {
		if (props.type !== 'submit' && props.type !== 'image') {
			diagnostics.push({
				kind: 'action-type',
				message: 'A <input> can only specify `formAction` with type="submit" or type="image".',
			});
			return diagnostics;
		}
	} else if (tag === 'button') {
		if (props.type != null && props.type !== 'submit') {
			diagnostics.push({
				kind: 'action-type',
				message: 'A <button> can only specify `formAction` with type="submit" or no type.',
			});
			return diagnostics;
		}
	} else if (tag !== 'form') {
		return diagnostics;
	}
	if (typeof action !== 'function') return diagnostics;

	if (tag === 'form') {
		if (props.method != null || props.encType != null || props.enctype != null) {
			diagnostics.push({
				kind: 'action-method',
				message:
					'A function form action cannot specify `method` or `encType`; ' +
					'Octane controls the submission transport.',
			});
		}
		if (props.target != null) {
			diagnostics.push({
				kind: 'action-target',
				message:
					'A function form action cannot specify `target`; ' +
					'the action always executes in the current window.',
			});
		}
		return diagnostics;
	}

	if (props.name != null) {
		diagnostics.push({
			kind: 'action-name',
			message:
				'A function `formAction` cannot specify `name`; ' +
				'the submitter identity is controlled by the action.',
		});
	}
	if (
		props.formMethod != null ||
		props.formmethod != null ||
		props.formEncType != null ||
		props.formenctype != null
	) {
		diagnostics.push({
			kind: 'action-method',
			message:
				'A function `formAction` cannot specify `formMethod` or `formEncType`; ' +
				'Octane controls the submission transport.',
		});
	}
	if (props.formTarget != null || props.formtarget != null) {
		diagnostics.push({
			kind: 'action-target',
			message:
				'A function `formAction` cannot specify `formTarget`; ' +
				'the action always executes in the current window.',
		});
	}
	return diagnostics;
}
