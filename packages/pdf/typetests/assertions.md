# Type probe transforms

Paired programs:

- `pristine.test.tsx` compiles against the pinned `react-pdf` React oracle.
- `adapted.test.tsrx` and `adapted-negative.test.ts` compile against `@octanejs/pdf`.

Allowed structural transforms between the pristine and adapted probes:

- import root `react-pdf` → `@octanejs/pdf`
- file extension `.tsx` → `.tsrx` for the Octane component program
- Octane class composition may include object-form class entries where React used arrays/strings
- native DOM event handler types replace React synthetic event types
- negative `@ts-expect-error` controls stay equivalent across both programs

Any other structural drift is a failure.
