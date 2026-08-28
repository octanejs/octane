// @vitest-environment jsdom
import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { validate } from './validate.ts';

describe('validate', () => {
  test('should validate form and return success result', async () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });

    const result = await validate(store);

    expect(result.success).toBe(true);
  });

  test('should return failure result when validation fails', async () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: '' },
      issues: [
        {
          kind: 'validation',
          type: 'non_empty',
          input: '',
          expected: '!""',
          received: '""',
          message: 'Name is required',
          path: [
            {
              type: 'object',
              origin: 'value',
              input: {},
              key: 'name',
              value: '',
            },
          ],
        },
      ],
    });

    const result = await validate(store);

    expect(result.success).toBe(false);
  });

  test('should focus first error field when shouldFocus is true', async () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      issues: [
        {
          kind: 'validation',
          type: 'non_empty',
          input: '',
          expected: '!""',
          received: '""',
          message: 'Name is required',
          path: [
            {
              type: 'object',
              origin: 'value',
              input: {},
              key: 'name',
              value: '',
            },
          ],
        },
      ],
    });
    const input = document.createElement('input');
    const focusSpy = vi.spyOn(input, 'focus');
    store.children.name.elements = [input];

    await validate(store, { shouldFocus: true });

    expect(focusSpy).toHaveBeenCalledOnce();
  });

  test('should not focus when shouldFocus is false', async () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      issues: [
        {
          kind: 'validation',
          type: 'non_empty',
          input: '',
          expected: '!""',
          received: '""',
          message: 'Name is required',
          path: [
            {
              type: 'object',
              origin: 'value',
              input: {},
              key: 'name',
              value: '',
            },
          ],
        },
      ],
    });
    const input = document.createElement('input');
    const focusSpy = vi.spyOn(input, 'focus');
    store.children.name.elements = [input];

    await validate(store, { shouldFocus: false });

    expect(focusSpy).not.toHaveBeenCalled();
  });
});
