# @unhead/react

> Full-stack `<head>` management for React applications

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

## Features

- ⚛️ React-optimized head management
- 🪝 React hooks integration
- 🔄 Reactive titles, meta tags, and other head elements
- 🔍 SEO-friendly head control
- 🖥️ Server-side rendering support
- 📦 Lightweight with zero dependencies (except for React & unhead)

## Installation

```bash
# npm
npm install @unhead/react

# yarn
yarn add @unhead/react

# pnpm
pnpm add @unhead/react
```

## Usage

### Setup

#### Client-side (SPA)

```jsx
import { createHead, UnheadProvider } from '@unhead/react/client'
// main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const head = createHead({ /* config */ })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UnheadProvider value={head}>
      <App />
    </UnheadProvider>
  </StrictMode>
)
```

Use the `value` prop with client, server, and streaming providers. The client provider still accepts the deprecated `head` prop for compatibility.

#### Server-side (SSR)

```jsx
import { createHead, UnheadProvider } from '@unhead/react/server'
// entry-server.jsx
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App'

export function render(url) {
  const head = createHead()
  const html = renderToString(
    <StrictMode>
      <UnheadProvider value={head}>
        <App />
      </UnheadProvider>
    </StrictMode>
  )
  return { html, head }
}
```

```jsx
import { createHead, UnheadProvider } from '@unhead/react/client'
// entry-client.jsx (for hydration)
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import App from './App'

const head = createHead({ /* config */ })

hydrateRoot(
  document.getElementById('root'),
  <StrictMode>
    <UnheadProvider value={head}>
      <App />
    </UnheadProvider>
  </StrictMode>
)
```

### Basic Usage

```jsx
// Home.jsx
import { useHead } from '@unhead/react'

function Home() {
  useHead({
    title: 'Home Page',
    meta: [
      {
        name: 'description',
        content: 'Welcome to our website'
      }
    ]
  })

  return <h1>Home</h1>
}

export default Home
```

### Setting Meta Tags

```jsx
// About.jsx
import { useSeoMeta } from '@unhead/react'

function About() {
  useSeoMeta({
    title: 'About Us',
    description: 'Learn more about our company',
    ogTitle: 'About Our Company',
    ogDescription: 'Our fantastic about page',
    ogImage: 'https://example.com/image.jpg',
  })

  return <h1>About Us</h1>
}

export default About
```

### Reactive Head Elements

```jsx
import { useHead } from '@unhead/react'
// Profile.jsx
import { useEffect, useState } from 'react'

function Profile() {
  const [userName, setUserName] = useState('User')

  // Create a head entry that can be patched
  const headEntry = useHead()

  useEffect(() => {
    headEntry.patch({
      title: `${userName} - Profile`, // Reactive title
      meta: [
        {
          name: 'description',
          content: `${userName}'s profile page`, // Reactive description
        },
      ],
    })
  }, [userName, headEntry])

  return (
    <div>
      <h1>
        {userName}
        's Profile
      </h1>
      <button onClick={() => setUserName('New Name')}>
        Update Name
      </button>
    </div>
  )
}

export default Profile
```

## Development

```bash
# Install dependencies
npm install

# Generate build files
npm run build

# Run tests
npm run test
```

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@unhead/react/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/@unhead/react

[npm-downloads-src]: https://img.shields.io/npm/dm/@unhead/react.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/@unhead/react

[license-src]: https://img.shields.io/github/license/unjs/unhead.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://github.com/unjs/unhead/blob/main/LICENSE
