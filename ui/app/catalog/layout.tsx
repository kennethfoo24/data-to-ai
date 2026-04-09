import React from 'react'

// Override the root layout's overflow:hidden so catalog pages can scroll
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', overflow: 'auto' }}>
      {children}
    </div>
  )
}
