---
'octane': patch
---

Prevent data requests from leaving a retired store, and keep writes whose server handler returned an invalid result eligible for receipt recovery. A native form whose write committed but returned invalid output now surfaces a server error instead of rendering a refusal.
