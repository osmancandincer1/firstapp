// Refreshes the disposable email domain list (APP.md §6.3: open-source list, weekly update).
// Source: github.com/disposable-email-domains/disposable-email-domains (CC0-1.0).
import { writeFileSync } from 'node:fs';

const SOURCE =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
// Never block these even if a list adds them (e.g. Apple "Hide My Email" relays, §6.1).
const ALLOW = new Set([
  'privaterelay.appleid.com',
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
]);

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const domains = [
  ...new Set(
    (await res.text())
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter(
        (l) => l && !l.startsWith('#') && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(l) && !ALLOW.has(l),
      ),
  ),
].sort();
if (domains.length < 1000)
  throw new Error(`suspiciously short list (${domains.length}); not writing`);

const out = 'supabase/functions/_shared/data/disposable_domains.json';
writeFileSync(out, JSON.stringify({ source: SOURCE, license: 'CC0-1.0', domains }) + '\n');
console.log(`${out}: ${domains.length} domains`);
