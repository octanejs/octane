---
'@octanejs/cli': patch
---

Reject arguments after a bare `--` instead of dropping them.

No command reads the tokens after `--`, so every one of them was discarded in
silence. That is reachable by an ordinary route: npm consumes the `--` itself
and forwards what follows, so `npm create octane app -- --template spa` is the
correct npm spelling, and the identical line under pnpm or yarn hands the `--`
through to the CLI. The flags then vanished and the run failed reporting that
`--template` was required, naming the one flag that was sitting in the caller's
command line.

Those tokens are now a usage error that names them and says which package
managers need the `--`. A command that wants to read them declares
`passthrough`, and a bare `--` with nothing after it discards nothing and stays
valid.
