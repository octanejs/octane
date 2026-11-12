---
'octane': minor
---

`octane/data` views page. A read's snapshot has `more`, which for a view says whether rows follow its window. `pages(store, view, params?, size?)` in `octane/data` and `usePages(view, params?)` in `octane/data/react` and `octane/data/octane` read a view a page at a time as one list: the snapshot joins the pages loaded so far, and `loadMore()` adds the next. Each page is an ordinary window of the view, so an edit moves a row between pages exactly as it does within one.
