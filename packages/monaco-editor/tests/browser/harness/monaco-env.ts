/**
 * Package Chromium harness uses the same npm + Vite `?worker` recipe as
 * `examples/monaco-playground` so version skew between the binding, loader,
 * and `monaco-editor@0.55.1` is exercised under real workers.
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
