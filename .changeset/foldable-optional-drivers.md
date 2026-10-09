---
'octane': patch
---

Ship less runtime to Vite applications that do not use optional capabilities
such as ViewTransition, Activity, form actions, or native signal reads. Vite's
default production minifier can now drop the code behind each capability an
application never installs. The js-framework rows app ships 2.6 kB less gzip,
and TodoMVC 3.0 kB less. Behavior is unchanged.
