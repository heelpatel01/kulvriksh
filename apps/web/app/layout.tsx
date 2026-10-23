import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kulvriksh',
  description: 'Kulvriksh digital platform (in development).',
  // Development placeholder: keep it out of search indexes until the real public site exists.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The site language(s) are not yet decided (roadmap R3); "en" is a placeholder.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
