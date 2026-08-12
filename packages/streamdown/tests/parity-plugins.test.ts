import { describe, expect, it } from 'vitest';
import { cjk, createCjkPlugin } from '@octanejs/streamdown/cjk';
import { code, createCodePlugin } from '@octanejs/streamdown/code';
import { math, createMathPlugin } from '@octanejs/streamdown/math';
import { createMermaidPlugin, mermaid } from '@octanejs/streamdown/mermaid';

describe('@octanejs/streamdown plugin entry points', function pluginEntryPoints() {
	it('exposes every official plugin factory and default instance', function exposesOfficialPlugins() {
		expect(code.type).toBe('code-highlighter');
		expect(createCodePlugin().name).toBe('shiki');
		expect(math.type).toBe('math');
		expect(createMathPlugin().name).toBe('katex');
		expect(mermaid.type).toBe('diagram');
		expect(createMermaidPlugin().language).toBe('mermaid');
		expect(cjk.type).toBe('cjk');
		expect(createCjkPlugin().remarkPluginsBefore.length).toBeGreaterThan(0);
	});
});
