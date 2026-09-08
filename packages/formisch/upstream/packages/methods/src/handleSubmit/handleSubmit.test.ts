// @vitest-environment jsdom
import type { SubmitEventHandler, SubmitHandler } from '@formisch/core';
import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { handleSubmit } from './handleSubmit.ts';

const schema = v.object({ name: v.string() });
type Schema = typeof schema;

describe('handleSubmit', () => {
  test('should call handler with output on valid form', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const handler: SubmitEventHandler<Schema> = vi.fn();
    const event = new SubmitEvent('submit');
    vi.spyOn(event, 'preventDefault');

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith({ name: 'John' }, event);
  });

  test('should call handler without event when none provided', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const handler: SubmitHandler<Schema> = vi.fn();

    const submitHandler = handleSubmit(store, handler) as () => Promise<void>;
    await submitHandler();

    expect(handler).toHaveBeenCalledWith({ name: 'John' }, undefined);
  });

  test('should set isSubmitting during submission', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    let submittingDuringCall = false;
    const handler: SubmitEventHandler<Schema> = vi.fn(() => {
      submittingDuringCall = store.isSubmitting.value;
    });

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(submittingDuringCall).toBe(true);
    expect(store.isSubmitting.value).toBe(false);
  });

  test('should set isSubmitted after form submission', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const handler: SubmitEventHandler<Schema> = vi.fn();

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(store.isSubmitted.value).toBe(true);
  });

  test('should not call handler on invalid form', async () => {
    const store = createTestStore(schema, {
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
    const handler: SubmitEventHandler<Schema> = vi.fn();

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(handler).not.toHaveBeenCalled();
  });

  test('should focus first error field on invalid form', async () => {
    const store = createTestStore(schema, {
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

    const submitHandler = handleSubmit(
      store,
      vi.fn() as SubmitEventHandler<Schema>
    );
    await submitHandler(new SubmitEvent('submit'));

    expect(focusSpy).toHaveBeenCalledOnce();
  });

  test('should set form errors when handler throws', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const error = new Error('Submit failed');
    const handler: SubmitEventHandler<Schema> = vi
      .fn()
      .mockRejectedValue(error);

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(store.errors.value).toEqual(['Submit failed']);
  });

  test('should reset isSubmitting after error', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const handler: SubmitEventHandler<Schema> = vi
      .fn()
      .mockRejectedValue(new Error('Failed'));

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(store.isSubmitting.value).toBe(false);
  });

  test('should set generic error message for non-Error throws', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const handler: SubmitEventHandler<Schema> = vi
      .fn()
      .mockRejectedValue('string error');

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(store.errors.value).toEqual(['An unknown error has occurred.']);
  });

  test('should handle async handler', async () => {
    const store = createTestStore(schema, {
      initialInput: { name: 'John' },
    });
    const handler: SubmitEventHandler<Schema> = vi
      .fn()
      .mockResolvedValue(undefined);

    const submitHandler = handleSubmit(store, handler);
    await submitHandler(new SubmitEvent('submit'));

    expect(handler).toHaveBeenCalledOnce();
    expect(store.isSubmitting.value).toBe(false);
  });
});
