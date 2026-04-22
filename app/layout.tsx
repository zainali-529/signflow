import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'SignFlow — Document Signing',
  description: 'Secure, legally-binding document signing with device verification',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* PDF.js for client-side PDF rendering */}
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" async />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#161624',
              color: '#EDE8DF',
              border: '1px solid #252535',
              borderRadius: '10px',
              fontFamily: 'Instrument Sans, sans-serif',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#3DB87A', secondary: '#080810' },
            },
            error: {
              iconTheme: { primary: '#E05B5B', secondary: '#080810' },
            },
          }}
        />
      </body>
    </html>
  )
}