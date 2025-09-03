import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'New Mexico Stream Conditions',
  description: 'Real-time stream conditions for New Mexico fly fishing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}