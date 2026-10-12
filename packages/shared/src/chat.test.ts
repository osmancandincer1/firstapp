import { chatActionSchema, messageFlags } from './chat.ts';

describe('messageFlags (§7.3, SOH-04..06)', () => {
  it('leaves ordinary messages alone', () => {
    expect(messageFlags('Cumartesi Moda sahilinde yürüyüşe ne dersin?')).toEqual({});
    expect(messageFlags('1990 doğumluyum, 2015’ten beri İzmir’deyim')).toEqual({});
  });

  it('marks links', () => {
    expect(messageFlags('Şuna bak: https://ornek.com/x').link).toBe(true);
    expect(messageFlags('www.ornek.net').link).toBe(true);
  });

  it('marks nudges off the app, even disguised', () => {
    for (const text of [
      'WhatsApp’tan yazsana',
      'w h a t s a p p var mı',
      'insta: @ece.k',
      'numaramı vereyim 0532 123 45 67',
      'tg’den konuşalım',
    ]) {
      expect(messageFlags(text).offPlatform).toBe(true);
    }
    expect(messageFlags('instant kahve sevmem').offPlatform).toBeUndefined();
  });

  it('marks money and crypto talk', () => {
    for (const text of [
      'Bana biraz para gönderir misin?',
      'Bitcoin yatırımı yapıyorum, sen de gel',
      'IBAN: TR12 0006 1005 1978 6457 8413 26',
      'usdt ile öde',
      '500$ lazım',
    ]) {
      expect(messageFlags(text).money).toBe(true);
    }
    expect(messageFlags('Kahveler benden!').money).toBeUndefined();
  });
});

describe('chatActionSchema', () => {
  const tableId = '00000000-0000-4000-8000-000000000001';
  const clientId = '00000000-0000-4000-8000-000000000002';

  it('checks message length and farewell keys', () => {
    expect(
      chatActionSchema.safeParse({ action: 'send', tableId, clientId, text: ' Selam ' }).success,
    ).toBe(true);
    expect(
      chatActionSchema.safeParse({ action: 'send', tableId, clientId, text: '   ' }).success,
    ).toBe(false);
    expect(
      chatActionSchema.safeParse({ action: 'send', tableId, clientId, text: 'x'.repeat(1001) })
        .success,
    ).toBe(false);
    expect(
      chatActionSchema.safeParse({ action: 'farewell', tableId, key: 'take_care' }).success,
    ).toBe(true);
    expect(chatActionSchema.safeParse({ action: 'farewell', tableId, key: 'ghost' }).success).toBe(
      false,
    );
    expect(
      chatActionSchema.safeParse({
        action: 'farewell',
        tableId,
        key: 'take_care',
        note: 'x'.repeat(141),
      }).success,
    ).toBe(false);
  });
});
