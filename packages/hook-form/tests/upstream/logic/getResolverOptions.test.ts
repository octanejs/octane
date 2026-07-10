// Ported from react-hook-form@7.81.0 src/__tests__/logic/getResolverOptions.test.ts (jest → vitest, octane runtime).
import { describe, expect, it, test } from 'vitest';
import type { InternalFieldName } from '../..';
import getResolverOptions from '../../../src/logic/getResolverOptions';

describe('getFielfs', () => {
	it('should return fields from `fieldsNames` and `fieldsRef`', () => {
		const fieldNames: Set<InternalFieldName> = new Set(['test.sub', 'test1']);
		const fieldsRef: any = {
			test: {
				sub: {
					_f: {
						ref: { name: 'test.sub', value: 'test' },
						name: 'test.sub',
						value: 'test',
					},
				},
			},
			test1: {
				_f: {
					ref: { name: 'test1', value: 'test1' },
					name: 'test1',
					value: 'test1',
				},
			},
		};

		expect(getResolverOptions(fieldNames, fieldsRef, undefined, true)).toMatchInlineSnapshot(`
      {
        "criteriaMode": undefined,
        "fields": {
          "test": {
            "sub": {
              "name": "test.sub",
              "ref": {
                "name": "test.sub",
                "value": "test",
              },
              "value": "test",
            },
          },
          "test1": {
            "name": "test1",
            "ref": {
              "name": "test1",
              "value": "test1",
            },
            "value": "test1",
          },
        },
        "names": [
          "test.sub",
          "test1",
        ],
        "shouldUseNativeValidation": true,
      }
    `);
	});
});
