// @vitest-environment jsdom
import { INTERNAL } from '@formisch/core';
import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { submit } from './submit.ts';

describe('submit', () => {
  test('should call requestSubmit on form element', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const form = document.createElement('form');
    // Mock requestSubmit since jsdom doesn't implement it
    form.requestSubmit = vi.fn();
    store[INTERNAL].element = form;

    submit(store);

    expect(form.requestSubmit).toHaveBeenCalledOnce();
  });

  test('should not throw if form element is undefined', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store[INTERNAL].element = undefined;

    expect(() => submit(store)).not.toThrow();
  });
});
