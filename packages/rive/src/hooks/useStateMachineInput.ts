import { useEffect, useState } from 'octane';
import { EventType, type Rive, type StateMachineInput } from '@rive-app/canvas';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Custom hook for fetching a stateMachine input from a rive file.
 *
 * @param rive - Rive instance
 * @param stateMachineName - Name of the state machine
 * @param inputName - Name of the input
 * @returns
 */
export default function useStateMachineInput(...rawArgs: unknown[]) {
	const [args, slot] = splitSlot(rawArgs);
	const rive = args[0] as Rive | null;
	const stateMachineName = args[1] as string | undefined;
	const inputName = args[2] as string | undefined;
	const initialValue = args[3] as number | boolean | undefined;

	const [input, setInput] = useState<StateMachineInput | null>(null, subSlot(slot, 'input'));

	useEffect(
		function syncInput() {
			function setStateMachineInput() {
				if (!rive || !stateMachineName || !inputName) {
					setInput(null);
				}

				if (rive && stateMachineName && inputName) {
					const inputs = rive.stateMachineInputs(stateMachineName);
					if (inputs) {
						const selectedInput = inputs.find(function matchName(candidate) {
							return candidate.name === inputName;
						});
						if (initialValue !== undefined && selectedInput) {
							selectedInput.value = initialValue;
						}
						setInput(selectedInput || null);
					}
				} else {
					setInput(null);
				}
			}
			setStateMachineInput();
			if (rive) {
				rive.on(EventType.Load, function onLoad() {
					// Check if the component/canvas is mounted before setting state to avoid setState
					// on an unmounted component in some rare cases
					setStateMachineInput();
				});
			}
		},
		[rive],
		subSlot(slot, 'sync'),
	);

	return input;
}
