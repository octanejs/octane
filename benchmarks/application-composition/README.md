# Application composition

One production-built application composes 96 effectful rows, 512 controlled fields, 512 external-store subscribers, native form submission, and async rejection/recovery. Chromium verifies that overlapping updates preserve the submitted draft, the store converges, async recovery succeeds, and navigation releases every lifecycle resource and subscription.

```bash
node benchmarks/bench.mjs --quick application-composition
node benchmarks/bench.mjs application-composition
```
