import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DataFabric — ShopStream Lineage',
  description: 'End-to-end data & AI pipeline lineage dashboard for ShopStream',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
