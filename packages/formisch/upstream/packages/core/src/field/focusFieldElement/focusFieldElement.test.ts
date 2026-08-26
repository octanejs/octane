// @vitest-environment jsdom
import * as v from 'valibot';
import { beforeEach, describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { focusFieldElement } from './focusFieldElement.ts';

describe('focusFieldElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('should return false and focus nothing for a field without elements', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.elements = [];

    expect(focusFieldElement(store.children.name)).toBe(false);
  });

  test('should focus a connected element and return true', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    store.children.name.elements = [input];

    expect(focusFieldElement(store.children.name)).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  test('should skip a detached element and return false', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const input = document.createElement('input');
    store.children.name.elements = [input];

    expect(focusFieldElement(store.children.name)).toBe(false);
    expect(document.activeElement).not.toBe(input);
  });

  test('should skip a disabled element and return false', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const input = document.createElement('input');
    input.disabled = true;
    document.body.appendChild(input);
    store.children.name.elements = [input];

    expect(focusFieldElement(store.children.name)).toBe(false);
    expect(document.activeElement).not.toBe(input);
  });

  test('should focus the first focusable element when several exist', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const first = document.createElement('input');
    const second = document.createElement('input');
    document.body.appendChild(first);
    document.body.appendChild(second);
    store.children.name.elements = [first, second];

    expect(focusFieldElement(store.children.name)).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  test('should fall through to the next element when the first is not focusable', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const disabled = document.createElement('input');
    disabled.disabled = true;
    const focusable = document.createElement('input');
    document.body.appendChild(disabled);
    document.body.appendChild(focusable);
    store.children.name.elements = [disabled, focusable];

    expect(focusFieldElement(store.children.name)).toBe(true);
    expect(document.activeElement).toBe(focusable);
  });

  test('should focus an element inside a shadow root and return true', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    shadow.appendChild(input);
    store.children.name.elements = [input];

    // `document.activeElement` retargets to the host, so the focus must be
    // read back from the element's own shadow root instead
    expect(focusFieldElement(store.children.name)).toBe(true);
    expect(shadow.activeElement).toBe(input);
  });
});
