// @vitest-environment jsdom
import * as v from 'valibot';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { focus } from './focus.ts';

describe('focus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('should focus first element of field', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    store.children.name.elements = [input];

    focus(store, { path: ['name'] });

    expect(document.activeElement).toBe(input);
  });

  test('should not throw if field has no elements', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.elements = [];

    expect(() => focus(store, { path: ['name'] })).not.toThrow();
  });

  test('should focus first element when field has multiple elements', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const input1 = document.createElement('input');
    const input2 = document.createElement('input');
    document.body.appendChild(input1);
    document.body.appendChild(input2);
    const focusSpy1 = vi.spyOn(input1, 'focus');
    const focusSpy2 = vi.spyOn(input2, 'focus');
    store.children.name.elements = [input1, input2];

    focus(store, { path: ['name'] });

    expect(focusSpy1).toHaveBeenCalledOnce();
    expect(focusSpy2).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input1);
  });

  test('should skip a detached element and focus the next one', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const detached = document.createElement('input');
    const connected = document.createElement('input');
    document.body.appendChild(connected);
    store.children.name.elements = [detached, connected];

    focus(store, { path: ['name'] });

    expect(document.activeElement).toBe(connected);
  });

  test('should skip a disabled element and focus the next one', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const disabled = document.createElement('input');
    disabled.disabled = true;
    const focusable = document.createElement('input');
    document.body.appendChild(disabled);
    document.body.appendChild(focusable);
    store.children.name.elements = [disabled, focusable];

    focus(store, { path: ['name'] });

    expect(document.activeElement).toBe(focusable);
  });

  test('should focus nested field', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );
    const input = document.createElement('input');
    document.body.appendChild(input);

    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.elements = [input];
    }

    focus(store, { path: ['user', 'email'] });

    expect(document.activeElement).toBe(input);
  });
});
