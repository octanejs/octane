---
'octane': patch
---

Keep hydration aligned after a `@try`, `<ErrorBoundary>`, `@for`, or `<Activity>`. A `@try` or `<ErrorBoundary>` left the hydration cursor inside its own server range, so a following component with several roots in a body without a template, such as `<>@try {…}<Pair /></>`, did not find its server range: it was rendered a second time beside the server's copy and reported a false mismatch, even when the server and client rendered the same props. Every boundary, list, and activity now steps past its server range as components and branches do. This also lets an `@if` or `@switch` arm that ends with one of them find where its content ends, so elements or text that the server's longer arm rendered after it are removed and reported once instead of staying on screen without a report.
