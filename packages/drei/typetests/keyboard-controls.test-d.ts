import {
	KeyboardControls,
	type KeyboardControlsEntry,
	type KeyboardControlsProps,
	useKeyboardControls,
} from '../src/index.js';

type Action = 'jump' | 'sprint';
const entry: KeyboardControlsEntry<Action> = { name: 'jump', keys: ['Space'], up: true };
const props: KeyboardControlsProps = { map: [entry], children: null, domElement: document.body };
const pressed: boolean = useKeyboardControls<Action>((state) => state.jump);
const [subscribe, getState] = useKeyboardControls<Action>();
subscribe((state) => state.jump.valueOf());
getState().sprint.valueOf();
KeyboardControls;
props;
pressed;

// @ts-expect-error action names must belong to the declared union
const invalidName: KeyboardControlsEntry<Action> = { name: 'duck', keys: ['KeyC'] };
// @ts-expect-error keys are strings
const invalidKeys: KeyboardControlsEntry = { name: 'jump', keys: [32] };
