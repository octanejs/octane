---
'octane': patch
---

`.tsrx` and `.tsx` modules now drop an imported name the module never reads as a value, as TypeScript does without `verbatimModuleSyntax`, and drop the import when no name is left. Before, `import { Icon } from './Icons'`, where `Icon` is a type, stayed in the compiled module and Rolldown failed the build with `"Icon" is not exported`, unless the import was written `import { type Icon }`. A name the module reads as a value, including one rendered as a component, is still imported, and so is an import written with no names, such as `import './styles.css'`. JavaScript modules keep every import.
