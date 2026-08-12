import { expectTypeOf } from 'vitest';
import type { JSX } from 'octane/jsx-runtime';

type InputHandler = NonNullable<JSX.IntrinsicElements['input']['onInput']>;
type InputHandlerEvent = Parameters<InputHandler>[0];
type ChangeHandler = NonNullable<JSX.IntrinsicElements['input']['onChange']>;
type ChangeHandlerEvent = Parameters<ChangeHandler>[0];

expectTypeOf<InputHandlerEvent>().toExtend<InputEvent>();
expectTypeOf<InputHandlerEvent['currentTarget']>().toExtend<HTMLInputElement>();
expectTypeOf<ChangeHandlerEvent>().toExtend<Event>();
