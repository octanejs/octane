// @vitest-environment jsdom
import * as v from 'valibot';
import { beforeEach, describe, expect, test } from 'vitest';
import type { InternalFieldStore } from '../../types/index.ts';
import { createTestStore } from '../../vitest/index.ts';
import { getElementInput } from './getElementInput.ts';

function getChild(
  store: ReturnType<typeof createTestStore>,
  key: string
): InternalFieldStore {
  const child = store.children[key];
  if (!child) {
    throw new Error(`Child store "${key}" not found`);
  }
  return child;
}

function createInput(
  type: string,
  value: string,
  options?: Partial<HTMLInputElement>
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  Object.assign(input, options);
  return input;
}

describe('getElementInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('text inputs', () => {
    test('should return value for text input', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      const input = createInput('text', 'John');
      expect(getElementInput(input, store.children.name)).toBe('John');
    });

    test('should return value for email input', () => {
      const store = createTestStore(v.object({ email: v.string() }));
      const input = createInput('email', 'test@example.com');
      expect(getElementInput(input, store.children.email)).toBe(
        'test@example.com'
      );
    });

    test('should return value for number input', () => {
      const store = createTestStore(v.object({ age: v.string() }));
      const input = createInput('number', '25');
      expect(getElementInput(input, store.children.age)).toBe('25');
    });
  });

  describe('checkbox inputs', () => {
    test('should return checked state for single checkbox', () => {
      const store = createTestStore(v.object({ agree: v.boolean() }));
      const input = createInput('checkbox', 'yes', {
        name: 'agree',
        checked: true,
      });
      document.body.appendChild(input);
      expect(getElementInput(input, store.children.agree)).toBe(true);
    });

    test('should return array of checked values for checkbox group', () => {
      const store = createTestStore(v.object({ colors: v.array(v.string()) }));

      const checkbox1 = createInput('checkbox', 'red', {
        name: 'colors',
        checked: true,
      });
      const checkbox2 = createInput('checkbox', 'blue', {
        name: 'colors',
        checked: false,
      });
      const checkbox3 = createInput('checkbox', 'green', {
        name: 'colors',
        checked: true,
      });
      document.body.appendChild(checkbox1);
      document.body.appendChild(checkbox2);
      document.body.appendChild(checkbox3);

      expect(getElementInput(checkbox1, store.children.colors)).toStrictEqual([
        'red',
        'green',
      ]);
    });
  });

  describe('radio inputs', () => {
    test('should return value when radio is checked', () => {
      const store = createTestStore(v.object({ gender: v.string() }));
      const input = createInput('radio', 'male', {
        name: 'gender',
        checked: true,
      });
      expect(getElementInput(input, store.children.gender)).toBe('male');
    });

    test('should return previous value when radio is not checked', () => {
      const store = createTestStore(v.object({ gender: v.string() }), {
        initialInput: { gender: 'female' },
      });
      const input = createInput('radio', 'male', {
        name: 'gender',
        checked: false,
      });
      expect(getElementInput(input, store.children.gender)).toBe('female');
    });
  });

  describe('select inputs', () => {
    test('should return value for single select', () => {
      const store = createTestStore(v.object({ country: v.string() }));
      const select = document.createElement('select');
      select.innerHTML = '<option value="us" selected>US</option>';
      expect(getElementInput(select, store.children.country)).toBe('us');
    });

    test('should return array for multiple select', () => {
      const store = createTestStore(
        v.object({ countries: v.array(v.string()) })
      );
      const select = document.createElement('select');
      select.multiple = true;
      select.innerHTML = `
        <option value="us" selected>US</option>
        <option value="uk">UK</option>
        <option value="de" selected>DE</option>
      `;
      expect(
        getElementInput(select, getChild(store, 'countries'))
      ).toStrictEqual(['us', 'de']);
    });

    test('should exclude disabled options from multiple select', () => {
      const store = createTestStore(
        v.object({ countries: v.array(v.string()) })
      );
      const select = document.createElement('select');
      select.multiple = true;
      select.innerHTML = `
        <option value="us" selected>US</option>
        <option value="uk" selected disabled>UK</option>
      `;
      expect(
        getElementInput(select, getChild(store, 'countries'))
      ).toStrictEqual(['us']);
    });
  });

  describe('file inputs', () => {
    test('should return file for single file input', () => {
      const store = createTestStore(v.object({ document: v.any() }));
      const input = createInput('file', '');
      const file = new File(['content'], 'test.txt');
      Object.defineProperty(input, 'files', { value: [file] });
      expect(getElementInput(input, store.children.document)).toBe(file);
    });

    test('should return files array for multiple file input', () => {
      const store = createTestStore(v.object({ documents: v.any() }));
      const input = createInput('file', '');
      input.multiple = true;
      const file1 = new File(['content1'], 'test1.txt');
      const file2 = new File(['content2'], 'test2.txt');
      Object.defineProperty(input, 'files', { value: [file1, file2] });
      expect(getElementInput(input, store.children.documents)).toStrictEqual([
        file1,
        file2,
      ]);
    });
  });

  describe('textarea', () => {
    test('should return value for textarea', () => {
      const store = createTestStore(v.object({ bio: v.string() }));
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello world';
      expect(getElementInput(textarea, store.children.bio)).toBe('Hello world');
    });
  });
});
