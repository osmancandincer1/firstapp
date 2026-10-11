import { colors } from '@nokuzo/design-tokens';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Nokuzo',
  description: 'Öğlen ve akşam, dokuzar kişi.',
  // Not launched yet: keep the placeholder site out of search engines.
  robots: { index: false, follow: false },
};

const night = colors.night;
const day = colors.day;

const css = `
:root { color-scheme: dark light; --bg: ${night.bgBase}; --raised: ${night.bgRaised}; --text: ${night.textPrimary}; --muted: ${night.textSecondary}; --accent: ${night.accentPrimary}; }
@media (prefers-color-scheme: light) {
  :root { --bg: ${day.bgBase}; --raised: ${day.bgRaised}; --text: ${day.textPrimary}; --muted: ${day.textSecondary}; --accent: ${day.accentPrimary}; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; line-height: 1.5; }
main { max-width: 640px; margin: 0 auto; padding: 64px 16px; }
h1 { font-family: Fraunces, Georgia, serif; font-size: 40px; margin: 0 0 8px; }
p { color: var(--muted); }
.dots { display: grid; grid-template-columns: repeat(3, 12px); gap: 8px; margin-bottom: 32px; }
.dots span { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <style>{css}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
