import { t } from '@/lib/copy';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import '@/styles/interference-diagrams.css';
import '@/styles/interference-system.css';
import '@/styles/discovery-scenes.css';
import '@/styles/home-page.css';
import '@/styles/mascot-echo.css';
import '@/styles/mascot-diagram.css';
import '@/styles/production-services.css';
import '@/styles/directions.css';
import '@/styles/spatial-site.css';
import '@/styles/brand-refresh.css';
import '@/styles/scroll-site.css';

const displayFont = localFont({
  src: './fonts/EnigmaLarge-Roman.otf',
  variable: '--font-display',
  weight: '400',
  style: 'normal',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

const bodyFont = localFont({
  src: [
    { path: './fonts/FavoritMono-Light.otf', weight: '300', style: 'normal' },
    { path: './fonts/FavoritMono-Regular.otf', weight: '400', style: 'normal' },
    { path: './fonts/FavoritMono-Medium.otf', weight: '500', style: 'normal' },
    { path: './fonts/FavoritMono-Bold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
  fallback: ['Courier New', 'monospace'],
});

export const metadata: Metadata = {
  title: { default: t('metadata.title'), template: t('metadata.titleTemplate') },
  description: t('metadata.description'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`} data-scroll-behavior="smooth"><body>{children}</body></html>;
}
