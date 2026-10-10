import { detectLanguage } from './detect';
import en from './en.json';
import tr from './tr.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations (AYR-08)', () => {
  it('have exactly the same keys in TR and EN', () => {
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });

  it('have no empty strings', () => {
    for (const dict of [tr, en]) {
      for (const k of keys(dict)) {
        const value = k
          .split('.')
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], dict);
        expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
      }
    }
  });
});

describe('detectLanguage', () => {
  it('defaults to Turkish', () => {
    expect(detectLanguage('tr')).toBe('tr');
    expect(detectLanguage('de')).toBe('tr');
    expect(detectLanguage(null)).toBe('tr');
    expect(detectLanguage(undefined)).toBe('tr');
  });

  it('uses English when the device asks for it', () => {
    expect(detectLanguage('en')).toBe('en');
  });
});
