// Type tests for the octane binding — checked by `pnpm test:types` (plain tsc,
// no emit; the file is never executed). Lines that must NOT typecheck are
// marked @ts-expect-error; a passing line under the marker is a tsc error.
import { map, WritableAtom } from 'nanostores'

import { useStore } from '../index.ts'

type TestType =
  | { id: string; isLoading: true }
  | { isLoading: false; a: string; b: number; c?: number }

let test = map<TestType>()

let testValue = useStore(test)
if (!testValue.isLoading) {
  testValue.b
}

// @ts-expect-error Property 'a' does not exist on type 'TestType'.
testValue.a

let testValueSlice = useStore(test, { keys: ['isLoading', 'a'] })
if (!testValueSlice.isLoading) {
  testValueSlice.a
  testValueSlice.b
}
if (testValueSlice.isLoading) {
  testValueSlice.id
  // @ts-expect-error Property 'a' does not exist on type
  testValueSlice.a
}

// @ts-expect-error Property 'a' does not exist on type 'TestType'.
testValueSlice.a

declare const customStore: WritableAtom<TestType> & {
  setKey: (key: 'hey' | 'there', value: unknown) => void
}
{
  // @ts-expect-error Type '"does-not-exist"' is not assignable
  useStore(customStore, { keys: ['does-not-exist'] })

  let testValueSlice2 = useStore(customStore, { keys: ['hey', 'there'] })
  testValueSlice2
}
