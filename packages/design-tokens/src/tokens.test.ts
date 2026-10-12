import {
  colors,
  contrastPairs,
  contrastRatio,
  exitDuration,
  motion,
  relativeLuminance,
  space,
  type ThemeName,
} from './index';

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // Order of arguments does not matter.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#777777'));
  });

  it('rejects malformed colors', () => {
    expect(() => relativeLuminance('red')).toThrow('Invalid color');
    expect(() => relativeLuminance('#FFF')).toThrow('Invalid color');
  });
});

describe('theme tokens (§12.1, §16.7)', () => {
  const themes = Object.keys(colors) as ThemeName[];

  it('keeps the values fixed by APP.md and D-065 ("Alev")', () => {
    expect(colors.night.bgBase).toBe('#0E0907');
    expect(colors.night.accentPrimary).toBe('#FF8A2A');
    expect(colors.day.bgBase).toBe('#FBF8F4');
    expect(colors.day.textPrimary).toBe('#171830');
    expect(colors.day.accentPrimary).toBe('#E8843C');
  });

  it('defines the same token set in every theme', () => {
    const keys = Object.keys(colors.night).sort();
    for (const t of themes) expect(Object.keys(colors[t]).sort()).toEqual(keys);
  });

  for (const theme of themes) {
    for (const [fg, bg] of contrastPairs) {
      it(`${theme}: ${fg} on ${bg} meets AA 4.5:1`, () => {
        expect(contrastRatio(colors[theme][fg], colors[theme][bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('layout and motion', () => {
  it('uses an 8-point grid', () => {
    expect(space(0)).toBe(0);
    expect(space(3)).toBe(24);
  });

  it('makes exits 20% faster than entrances', () => {
    expect(exitDuration(250)).toBe(200);
    expect(motion.durationFast).toBeGreaterThanOrEqual(180);
    expect(motion.durationSlow).toBeLessThanOrEqual(280);
  });
});
