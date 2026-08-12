# Event delegation

Real Chromium dispatches 128 native bubbling `InputEvent`s to distinct hosts in a 512-field application. The correctness gate checks native capture, native bubbling, every framework handler, and every resulting controlled input and output. Timings are published with p95/p99 statistics.

```bash
node benchmarks/bench.mjs --quick event-delegation
node benchmarks/bench.mjs event-delegation
```

## Deterministic delegated-event work

`work.mjs` exercises the same production 512-field application through 128
native `InputEvent`s, with a real framework capture handler on the form and the
existing bubble handlers on its controlled inputs. Its temporary identity
observers are isolated from the ordinary timing runner.

Each event still defines `currentTarget` for capture and bubble, so exactly 256
property definitions remain. The gate requires those definitions to reuse one
descriptor and one getter instead of allocating 256 distinct instances of each.
It also requires the 128 capture traversals to reuse one path array. Native
capture and bubbling, framework capture, event targets, all 128 controlled
inputs, and their corresponding output text must remain correct.

The work gate builds its own production fixture, starts a temporary preview, and
closes it before exiting. The unified benchmark runner also invokes the gate
after its existing per-framework timing runs:

```bash
node benchmarks/event-delegation/work.mjs
node benchmarks/bench.mjs --quick event-delegation
```

Set `EVENT_URL` to reuse an existing production preview instead of building one.
