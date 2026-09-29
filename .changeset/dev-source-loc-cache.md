---
'octane': patch
---

Read each component's source at most once when the development runtime looks up
its `__octane_loc` marker. Form diagnostics walk every ancestor block for each
mounted host element, and the lookup ran `Function.prototype.toString` plus a
regex on every visit without caching. Output compiled without `dev: true` has
no marker, so every lookup missed and repeated: a 50-row `createElement` list
read component source 703 times per mount, and larger trees scanned megabytes of
source. Development mounts no longer pay that per element. Production builds are
unchanged.
