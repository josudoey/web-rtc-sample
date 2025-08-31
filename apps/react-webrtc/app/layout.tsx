import { Suspense } from 'react'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import './globals.css'

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
      <body>
        <Suspense>
          <Theme>{children}</Theme>
        </Suspense>
      </body>
    </html>
  )
}
