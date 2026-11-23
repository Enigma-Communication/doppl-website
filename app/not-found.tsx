import { t } from '@/lib/copy';
import Link from 'next/link';
import { Header } from '@/components/identity';
export default function NotFound(){return <div className="brand-not-found"><Header inner/><main className="not-found"><span className="mono">{t('notFound.label')}</span><h1><span style={{ whiteSpace: 'pre-line' }}>{t('notFound.title')}</span></h1><Link href="/" className="text-link mono">{t('notFound.cta')}</Link></main></div>;}
