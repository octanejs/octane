import type { Framework } from '~/libraries';
import type { LandingCodeExampleData } from './LandingCodeExampleCard';

const queryCodeExampleFrameworks: Array<Framework> = [
	'react',
	'preact',
	'solid',
	'vue',
	'svelte',
	'angular',
	'lit',
];

export const queryCodeExample: LandingCodeExampleData = {
	frameworks: queryCodeExampleFrameworks,
	codeByFramework: {
		react: {
			lang: 'tsx',
			code: `import { useQuery } from '@tanstack/react-query'

function Todos() {
  const { data, isPending, error } = useQuery({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(r => r.json()),
  })

  if (isPending) return <span>Loading...</span>
  if (error) return <span>Oops!</span>

  return <ul>{data.map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

export default Todos`,
		},
		solid: {
			lang: 'tsx',
			code: `import { createQuery } from '@tanstack/solid-query'

function Todos() {
  const todos = createQuery(() => ({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(r => r.json()),
  }))

  return <ul>{todos.data?.map((t) => <li>{t.title}</li>)}</ul>
}

export default Todos`,
		},
		preact: {
			lang: 'tsx',
			code: `import { useQuery } from '@tanstack/preact-query'

function Todos() {
  const { data, isPending, error } = useQuery({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(r => r.json()),
  })

  if (isPending) return <span>Loading...</span>
  if (error) return <span>Oops!</span>

  return <ul>{data.map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

export default Todos`,
		},
		vue: {
			lang: 'vue',
			code: `<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

const { data, isPending, error } = useQuery({
  queryKey: ['todos'],
  queryFn: () => fetch('/api/todos').then(r => r.json()),
})
</script>

<template>
  <ul v-if="data">
    <li v-for="t in data" :key="t.id">{{ t.title }}</li>
  </ul>
  <span v-else-if="isPending">Loading...</span>
  <span v-else>Oops!</span>
</template>`,
		},
		svelte: {
			lang: 'svelte',
			code: `<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'

  const todos = createQuery(() => ({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(r => r.json()),
  }))
</script>

{#if todos.isLoading}
  Loading...
{:else if todos.isError}
  Oops!
{:else if todos.isSuccess}
  <ul>
    {#each todos.data as t}
      <li>{t.title}</li>
    {/each}
  </ul>
{/if}`,
		},
		angular: {
			lang: 'ts',
			code: `import { Component } from '@angular/core'
import { injectQuery } from '@tanstack/angular-query-experimental'

@Component({
  selector: 'todos',
  standalone: true,
  template: \
\`
    <ng-container *ngIf="todos.isPending()">
      Loading...
    </ng-container>
    <ul *ngIf="todos.data() as data">
      <li *ngFor="let t of data">
        {{ t.title }}
      </li>
    </ul>
  \`,
})
export class TodosComponent {
  todos = injectQuery(() => ({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(r => r.json()),
  }))
}
`,
		},
		lit: {
			lang: 'ts',
			code: `import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { createQueryController } from '@tanstack/lit-query'

@customElement('todos-list')
export class TodosList extends LitElement {
  private todos = createQueryController(this, {
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(r => r.json()),
  })

  render() {
    const { data, isPending, error } = this.todos()

    if (isPending) return html\`<span>Loading...</span>\`
    if (error) return html\`<span>Oops!</span>\`

    return html\`<ul>\${data.map(t => html\`<li>\${t.title}</li>\`)}</ul>\`
  }
}`,
		},
	},
};

export const formCodeExample: LandingCodeExampleData = {
	frameworks: ['react'],
	title: 'React field and submit state',
	codeByFramework: {
		react: {
			lang: 'tsx',
			code: `import { useForm } from '@tanstack/react-form'

export default function PeoplePage() {
  const form = useForm({
    defaultValues: { age: 0 },
    onSubmit: ({ value }) => {
      alert(JSON.stringify(value, null, 2))
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field
        name="age"
        validators={{
          onChange: ({ value }) =>
            value > 13 ? undefined : 'Must be 13 or older',
        }}
        children={(field) => (
          <>
            <input
              name={field.name}
              value={field.state.value}
              type="number"
              onBlur={field.handleBlur}
              onChange={(event) =>
                field.handleChange(event.target.valueAsNumber)
              }
            />
            {!field.state.meta.isValid && (
              <em>{field.state.meta.errors.join(', ')}</em>
            )}
          </>
        )}
      />
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <button type="submit" disabled={!canSubmit}>
            {isSubmitting ? '...' : 'Submit'}
          </button>
        )}
      />
    </form>
  )
}`,
		},
	},
};

export const virtualCodeExample: LandingCodeExampleData = {
	frameworks: ['react'],
	title: 'React virtual rows',
	codeByFramework: {
		react: {
			lang: 'tsx',
			code: `import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export default function VirtualRows() {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: 10000,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
  })

  return (
    <div ref={parentRef} style={{ height: 320, overflow: 'auto' }}>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualRow.size,
              transform: 'translateY(' + virtualRow.start + 'px)',
            }}
          >
            Row {virtualRow.index}
          </div>
        ))}
      </div>
    </div>
  )
}`,
		},
	},
};

export const tableCodeExample: LandingCodeExampleData = {
	frameworks: ['react'],
	title: 'React table instance',
	codeByFramework: {
		react: {
			lang: 'tsx',
			code: `import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'

const data = [{ id: 1, name: 'Ada' }]
const columns = [{ accessorKey: 'name', header: 'Name' }]

export default function SimpleTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}`,
		},
	},
};
