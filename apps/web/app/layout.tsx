import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  // The production domain is TBC (roadmap R41). SITE_URL is a non-secret server setting.
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: { template: '%s · Kulvriksh', default: 'Kulvriksh: your family history, privately kept' },
  description:
    'Kulvriksh is a private digital home for family history: build your family tree, keep records and voices, and commission research by genealogists.',
  // Development build: keep every page out of search indexes until the public site launches.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#1f4d3a',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The site language(s) are not yet decided (roadmap R3); "en" is a placeholder.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
