---
'@octanejs/pdf': patch
---

Use the PDF.js legacy build for browser compatibility. Existing integrations should configure `pdfjs.GlobalWorkerOptions.workerSrc` to load `pdfjs-dist/legacy/build/pdf.worker.min.mjs`.
