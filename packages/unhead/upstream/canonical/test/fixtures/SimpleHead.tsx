import React from 'react'
import { Head } from '../../src/components'

export function SimpleHead() {
  return (
    <>
      <Head>
        <title data-tagPriority="high">Default Title</title>
        <meta name="description" content="Default Description" />
        <link rel="stylesheet" href="default-styles.css" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'" />
        <link rel="icon" href="favicon.ico" />
        <link rel="preload" href="https://example.com/font.woff2" as="font" type="font/woff2" />
        <link rel="dns-prefetch" href="//example.com" />
        <link rel="prefetch" href="https://example.com/next-page" />
        <link rel="prerender" href="https://example.com/next-page" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            'name': 'Example',
            'url': 'https://www.example.com',
          })}
        </script>
        <script type="module" src="https://example.com/module.js"></script>
        <script noModule src="https://example.com/nomodule.js"></script>
        <script async src="https://example.com/async-script.js"></script>
        <script defer src="https://example.com/defer-script.js"></script>
        <style>{`body { background-color: #f0f0f0; }`}</style>
      </Head>
      ,
      <Head>
        <title>Default Title 2</title>
      </Head>
    </>
  )
}
