/**
 * Default consumer recipe: npm `monaco-editor@0.55.1` via Vite `?worker` imports
 * and `loader.config({ monaco })`. monaco-editor 0.55 exports `"./*": "./*"`, so
 * worker imports use full `esm/vs/...` paths (unlike 0.56+, which maps shorthand
 * subpaths).
 *
 * CSS imports via `monaco-editor/min/vs/editor/editor.main.css` (on the exports
 * map through `"./*": "./*"`).
 *
 * CDN AMD `loader.config({ paths: { vs } })` remains a documented alternate in
 * the package README for apps that intentionally avoid bundling Monaco.
 */
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { loader } from '@octanejs/monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';

globalThis.MonacoEnvironment = {
	getWorker(_workerId: string, label: string): Worker {
		switch (label) {
			case 'json':
				return new jsonWorker();
			case 'css':
			case 'scss':
			case 'less':
				return new cssWorker();
			case 'html':
			case 'handlebars':
			case 'razor':
				return new htmlWorker();
			case 'typescript':
			case 'javascript':
				return new tsWorker();
			default:
				return new editorWorker();
		}
	},
};

loader.config({ monaco });
