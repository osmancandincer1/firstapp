import {
  decidePhoto,
  foldText,
  moderateText,
  photosComplete,
  type PhotoEvidence,
} from './moderation.ts';

describe('moderateText (§7.2)', () => {
  it.each([
    'Pazar kahvaltısı: serpme mi, simit-çay mı?',
    'Instant kahve içmem, filtre severim.',
    '1990 2000 arası müzik',
    'Signal processing mühendisiyim',
    'Fiyat/performans kahvecisi arıyorum',
  ])('allows ordinary text: %p', (text) => {
    expect(moderateText(text).action).not.toBe('block');
  });

  it.each([
    ['0532 123 45 67', 'contact_info'],
    ['ara: +90 (532) 123-4567', 'contact_info'],
    ['ece @ gmail . com', 'contact_info'],
    ['yaz bana ece(at)gmail(dot)com', 'contact_info'],
    ['@ece.yilmaz', 'contact_info'],
    ['İnstagram: eceyilmaz', 'contact_info'],
    ['w h a t s a p p tan yaz', 'contact_info'],
    ['1nst4gr4m', 'contact_info'],
    ['wp den konuşalım', 'contact_info'],
    ['insta ece', 'contact_info'],
    ['www.ece.com', 'link'],
    ['https://example.org/x', 'link'],
    ['benim sitem ece.me', 'link'],
    ['siktir', 'profanity'],
    ['ORO$PU', 'profanity'],
  ])('blocks %p as %s', (text, reason) => {
    expect(moderateText(text)).toEqual({ action: 'block', reason });
  });

  it('sends commercial wording to review instead of blocking', () => {
    expect(moderateText('Saatlik ücret 500 TL')).toEqual({
      action: 'review',
      reason: 'commercial',
    });
  });

  it('folds Turkish letters and look-alikes', () => {
    expect(foldText('İSTANBUL 1ş')).toBe('istanbul is');
  });
});

describe('decidePhoto (§6.4, §7.2, VER-02)', () => {
  const base: PhotoEvidence = {
    labels: [],
    texts: [],
    faces: [{ ageLow: 24, ageHigh: 30 }],
    selfMatch: true,
    isMain: true,
  };

  it('approves a clear photo of the user', () => {
    expect(decidePhoto(base)).toEqual({ status: 'approved', faceMatched: true });
  });

  it.each([
    [{ name: 'Explicit Nudity', parent: null, confidence: 95 }, 'explicit'],
    [{ name: 'Exposed Female Genitalia', parent: 'Explicit', confidence: 91 }, 'explicit'],
    [{ name: 'Weapons', parent: 'Violence', confidence: 88 }, 'violence'],
    [{ name: 'Drug Products', parent: 'Drugs & Tobacco', confidence: 85 }, 'drugs'],
    [{ name: 'Hate Symbols', parent: null, confidence: 99 }, 'hate'],
  ])('rejects %p as %s', (label, reason) => {
    expect(decidePhoto({ ...base, labels: [label] })).toEqual({ status: 'rejected', reason });
  });

  it('ignores low-confidence labels and allows swimwear, alcohol and tobacco', () => {
    expect(
      decidePhoto({ ...base, labels: [{ name: 'Explicit Nudity', parent: null, confidence: 60 }] })
        .status,
    ).toBe('approved');
    for (const name of ['Swimwear or Underwear', 'Alcohol', 'Tobacco']) {
      expect(
        decidePhoto({ ...base, labels: [{ name, parent: null, confidence: 99 }] }).status,
      ).toBe('approved');
    }
  });

  it('rejects images with contact details and reviews long text', () => {
    expect(decidePhoto({ ...base, texts: ['insta: eceyilmaz'] })).toEqual({
      status: 'rejected',
      reason: 'text_contact',
    });
    expect(
      decidePhoto({ ...base, texts: ['Bu bir ekran görüntüsü gibi görünen çok uzun bir yazı'] }),
    ).toEqual({
      status: 'review',
      reason: 'text',
    });
  });

  it('sends possible minors to a human, even with an adult (§7.7)', () => {
    expect(
      decidePhoto({
        ...base,
        faces: [
          { ageLow: 25, ageHigh: 31 },
          { ageLow: 6, ageHigh: 10 },
        ],
      }),
    ).toEqual({
      status: 'review',
      reason: 'possible_minor',
    });
  });

  it('requires the user’s own face on the main photo only', () => {
    expect(decidePhoto({ ...base, faces: [] })).toEqual({ status: 'rejected', reason: 'no_face' });
    expect(decidePhoto({ ...base, faces: [], isMain: false })).toEqual({
      status: 'approved',
      faceMatched: false,
    });
    expect(decidePhoto({ ...base, selfMatch: false })).toEqual({
      status: 'rejected',
      reason: 'not_you',
    });
    expect(decidePhoto({ ...base, selfMatch: false, isMain: false })).toEqual({
      status: 'rejected',
      reason: 'not_you',
    });
  });
});

describe('photosComplete', () => {
  const p = (position: number, status: 'approved' | 'review' | 'rejected', faceMatched = true) => ({
    position,
    status,
    faceMatched,
  });

  it('needs three approved photos with a face-matched main photo', () => {
    expect(
      photosComplete([p(0, 'approved'), p(1, 'approved', false), p(2, 'approved', false)]),
    ).toBe(true);
    expect(photosComplete([p(0, 'approved'), p(1, 'approved'), p(2, 'review')])).toBe(false);
    expect(photosComplete([p(0, 'approved', false), p(1, 'approved'), p(2, 'approved')])).toBe(
      false,
    );
    expect(
      photosComplete([
        p(0, 'rejected'),
        p(1, 'approved'),
        p(2, 'approved'),
        p(3, 'approved', false),
      ]),
    ).toBe(true);
  });
});
