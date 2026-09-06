---
'octane': patch
---

Allow a scoped `<style>` inside a split `<Hydrate>` child when its whole lexical style scope — the block and the host elements it stamps — sits inside the boundary. Client and server keep the authored-position hash. A scope that straddles the boundary is still `OCTANE_HYDRATE_SPLIT_STYLE`.
