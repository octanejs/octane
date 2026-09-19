# Stable native event authority

`setEventHandler` retains the precise invocation for native event readers, including modules that import signals later. Replacing callback data under the same authority used to rewrite the element-to-owner WeakMap even when the rollback journal already found that its value was unchanged. This change skips only identical authority writes. New slots and actual authority changes still publish; retirement markers and deferred invocation recipes remain.

Immediate publication compares the previous map value before journaling and writing. Staged publication compares inside the queued action, after earlier actions publish. Comparing against the committed map during preparation is unsound: committed A can have pending writes B then A, and both writes must publish in order.

Run the deterministic public compiled consumer:

```sh
node --test benchmarks/scoped-signals/stable-event-authority.test.mjs
```

It compiles a frozen adopted TSRX AST in development and production, with matching `NODE_ENV`, and bundles the worktree's authored public entrypoints. One hundred keyed rows contain four native buttons, dynamic scalar text/title and an uncontrolled input. The observer counts actual WeakMap writes; independent controls assert the latest callback arguments, changed captures, reordered host/input identity, typed draft value and cleanup.

Matched against main `9291944a2091cdfc3f5a7a5223c8f7fdef50cc48`:

| Element authority writes | Main | Candidate |
| --- | ---: | ---: |
| Initial mount, 100 rows × 4 buttons | 400 | 400 |
| Four retained updates and reorders | 400 | 0 |
| One changed callback capture per row | 100 | 0 |
| Total | 900 | 400 |

The same counts hold in development and production. This is a reduction in map writes, not a claim about allocation, heap size or complete elimination of prospective signal metadata.

A separate public `hostComponent` controller updates a mounted button outside rendering under `runWithSignalOwner`. One hundred same-owner changes exchange 100 writes for 100 reads; two actual A→B→A changes retain two writes and add two reads. Native clicks observe the current callback and owner, the same host survives, and cleanup removes it. The behavioral test also holds a native ViewTransition preparation that queues B then A while committed A remains visible. Moving the comparison to preparation fails both dev/prod owner assertions. The unmodified main passes these public semantic controls and fails both deterministic write guards.

A single quiet outside-render timing run used 10,000 warmup updates per variant and nine alternating ABBA/BAAB rounds, each sample containing 10,000 updates (18 samples per variant). Main median was 5.805 ms, IQR 5.663–5.918; candidate median was 5.680 ms, IQR 5.603–5.771. The ranges overlap. No reliable CPU improvement is claimed, and the read cost on actual owner changes remains.

Production esbuild 0.28.1 controls use the same compiler, dependencies, authored consumer, public source aliases, minification, target and defines. Node 24.19.0 and the frozen lock SHA `af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b` are shared by both variants. Baseline runtime SHA is `5f1bea3fbc3be54af95063cf77aa008ca75de12ecdc73d2f837c5fee45c2c123`; candidate is `be76caae2454ee41e58c54d066dce9d6eb2a26cc2e17ae01c4e2310012bacc67`.

| Production closure | Main raw / gzip | Candidate raw / gzip | Gzip delta |
| --- | ---: | ---: | ---: |
| Public generic createRoot | 189,578 / 60,895 | 189,593 / 60,897 | +2 |
| Public compiled no-handle consumer | 203,463 / 65,106 | 203,478 / 65,110 | +4 |
| Actual model, controls and transition consumer | 257,576 / 82,061 | 257,591 / 82,069 | +8 |
| Renderer-free engine | 47,423 / 14,508 | 47,423 / 14,508 | 0 |
| Public ordinary SSR | 50,662 / 17,843 | 50,662 / 17,843 | 0 |

The twelve public engine/native/binding/bootstrap/compiled-signals controls are byte- and hash-identical. There is no cost transfer to engine or SSR. The dev no-handle consumer is 77,786→77,789 gzip bytes. Bundle size is a small tradeoff for fewer writes; this patch does not claim a bundle reduction.
