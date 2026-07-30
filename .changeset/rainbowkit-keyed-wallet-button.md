---
'@octanejs/rainbowkit': patch
---

Key the two elements `WalletButton` returns, so rendering one no longer warns.

`WalletButton` returns an array — the connect control, plus an error paragraph
that appears only after a failed request. Octane reconciles an array return as
a keyed list, so without keys it warned on render:

```
Octane: each element in an array child should have a unique "key" prop
```

and matched the two slots by position, which lets the button be reconciled
against the error node when the error appears or clears — losing the control's
DOM identity and its focus. The two slots are fixed roles, so the role name is
their stable identity.
