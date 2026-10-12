import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import * as profileApi from '@/features/profile/api';
import { router, resetRouter, searchParams } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import * as api from './api';
import type { PublicProfile, Tur, TurCard } from './api';
import { AnswerComposerScreen } from './AnswerComposerScreen';
import { FiltersScreen, stepAge } from './FiltersScreen';
import { SavedScreen } from './SavedScreen';
import { TurScreen } from './TurScreen';
import { firstOpenIndex, turView } from './turState';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('./api');
jest.mock('@/features/profile/api');
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
jest.mock('@/lib/media', () => ({ readBytes: () => Promise.resolve(new Uint8Array([7])) }));
const mockRecorder = {
  prepareToRecordAsync: jest.fn(),
  record: jest.fn(),
  stop: jest.fn(),
  uri: 'file://a.m4a',
};
const mockRecState = { isRecording: false, durationMillis: 0 };
const mockPermission = { granted: true };
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: { requestRecordingPermissionsAsync: () => Promise.resolve(mockPermission) },
  setAudioModeAsync: () => Promise.resolve(),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => mockRecState,
  useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }),
}));

const m = jest.mocked(api);
const pm = jest.mocked(profileApi);
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOUR = 3_600_000;

const person = (name: string): PublicProfile => ({
  name,
  age: 30,
  city: 'Konya',
  verified: true,
  intent: 'long_term',
  doorQuestion: { tr: 'Pazar kahvaltısı: serpme mi, simit-çay mı?', en: 'Sunday breakfast?' },
  interests: [{ tr: 'Yürüyüş', en: 'Hiking' }],
  photos: [{ id: UUID(90), url: 'https://signed/p.jpg' }],
  voice: { url: 'https://signed/v.m4a', promptTr: 'En sevdiğim ses', promptEn: 'Favourite sound' },
});
const card = (n: number, action: TurCard['action'] = 'none'): TurCard => ({
  cardId: UUID(n),
  candidateId: UUID(100 + n),
  position: n,
  action,
  reasons: {
    reasons: [
      { key: 'same_intent', value: 'long_term' },
      { key: 'shared_interests', items: [{ tr: 'Yürüyüş', en: 'Hiking' }] },
    ],
    all: ['same_intent', 'shared_interests', 'both_active'],
    difference: { key: 'smoking', theirs: 'social', yours: 'never' },
  },
  profile: person(`Kişi ${n}`),
});
const tur = (cards: TurCard[], over: Partial<Tur> = {}): Tur => ({
  batchId: UUID(1),
  turDate: '2026-10-11',
  kind: 'evening',
  opensAt: new Date(Date.now() - HOUR).toISOString(),
  poolSize: 40,
  hint: null,
  cards,
  ...over,
});
const nine = () => Array.from({ length: 9 }, (_, i) => card(i + 1));

beforeEach(() => {
  jest.clearAllMocks();
  resetRouter();
  mockPermission.granted = true;
  Object.assign(mockRecState, { isRecording: false, durationMillis: 0 });
  useSession.setState({ status: 'signed_in', userId: 'u1' });
  pm.fetchCities.mockResolvedValue([]);
  m.viewTur.mockResolvedValue({ ok: true, data: { ok: true, tur: tur(nine()) } });
  m.listSaved.mockResolvedValue({ ok: true, data: { ok: true, saved: [] } });
  m.cardAction.mockResolvedValue({ ok: true, data: { ok: true } });
  m.lessLikeThis.mockResolvedValue({ ok: true, data: { ok: true } });
  m.sendAnswer.mockResolvedValue({ ok: true, data: { ok: true, answerId: UUID(7) } });
});

// --- Pure logic --------------------------------------------------------------------------

describe('turView', () => {
  const now = new Date('2026-10-11T19:00:00Z'); // 22:00 Istanbul
  it('waits for the next opening when there is no Round or it is not open yet', () => {
    // 22:00 Istanbul: the next Round is tomorrow's noon one (D-062).
    expect(turView(null, now)).toEqual({
      kind: 'waiting',
      opensAt: new Date('2026-10-12T09:00:00Z'),
    });
    const later = tur([card(1)], { opensAt: '2026-10-11T20:00:00Z' });
    expect(turView(later, now)).toEqual({
      kind: 'waiting',
      opensAt: new Date('2026-10-11T20:00:00Z'),
    });
  });
  it('is honest about an empty or small pool', () => {
    expect(turView(tur([], { opensAt: '2026-10-11T18:00:00Z' }), now).kind).toBe('empty');
    const small = turView(tur([card(1), card(2)], { opensAt: '2026-10-11T18:00:00Z' }), now);
    expect(small.kind === 'cards' && small.small).toBe(true);
  });
  it('finishes once every card has a decision', () => {
    const done = tur([card(1, 'answered'), card(2, 'passed'), card(3, 'saved')], {
      opensAt: '2026-10-11T18:00:00Z',
    });
    expect(turView(done, now).kind).toBe('finished');
    expect(firstOpenIndex([card(1, 'passed'), card(2), card(3)])).toBe(1);
    expect(firstOpenIndex([card(1, 'passed')])).toBe(0);
  });
});

describe('stepAge (§6.6: 18–99, at least 4 years)', () => {
  const p = {
    ageMin: 25,
    ageMax: 30,
    distanceKm: null,
    intents: ['long_term' as const],
    voiceOnly: false,
  };
  it('keeps the span and the bounds', () => {
    expect(stepAge(p, 'ageMin', 1).ageMin).toBe(26);
    expect(stepAge({ ...p, ageMin: 26 }, 'ageMin', 1).ageMin).toBe(26);
    expect(stepAge({ ...p, ageMin: 18 }, 'ageMin', -1).ageMin).toBe(18);
    expect(stepAge({ ...p, ageMax: 99 }, 'ageMax', 1).ageMax).toBe(99);
    expect(stepAge({ ...p, ageMin: 26 }, 'ageMax', -1).ageMax).toBe(30);
    expect(stepAge(p, 'ageMax', 1).ageMax).toBe(31);
  });
});

// --- Tur ------------------------------------------------------------------------------

describe('TurScreen (§8.1 #18)', () => {
  it('shows a countdown before the Round opens', async () => {
    m.viewTur.mockResolvedValue({ ok: true, data: { ok: true, tur: null } });
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByText(/^Sıradaki Tur saat (12|21):00’de açılıyor$/)).toBeTruthy();
    expect(screen.getByText(/sa \d+ dk kaldı/)).toBeTruthy();
  });

  it('shows the offline state with retry when nothing is cached (§8.2)', async () => {
    m.viewTur.mockResolvedValue({ ok: false, error: 'network' });
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByTestId('tur-error')).toBeTruthy();
    expect(screen.getByText('İnternet bağlantısı yok. Bağlanınca yeniden dene.')).toBeTruthy();
    m.viewTur.mockResolvedValue({ ok: true, data: { ok: true, tur: tur(nine()) } });
    await fireEvent.press(screen.getByText('Tekrar dene'));
    expect(await screen.findByTestId('tur-cards')).toBeTruthy();
  });

  it('shows cards with a position indicator and moves back and forth', async () => {
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByText('Kişi 1')).toBeTruthy();
    expect(screen.getByLabelText('Kart 1 / 9')).toBeTruthy();
    await fireEvent.press(screen.getByText('İleri'));
    expect(screen.getByText('Kişi 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Geri'));
    expect(screen.getByText('Kişi 1')).toBeTruthy();
    expect(screen.queryByTestId('pool-hint')).toBeNull();
  });

  it('continues at the first card without a decision', async () => {
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: tur([card(1, 'passed'), card(2)]) },
    });
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByText('Kişi 2')).toBeTruthy();
  });

  it('"Neden bu kişi?" explains in words and lets the user ask for fewer like this', async () => {
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('Neden bu kişi?'));
    expect(screen.getByText('• İkiniz de “Uzun ilişki” diyorsunuz')).toBeTruthy();
    expect(screen.getByText('• Ortak ilgi: Yürüyüş')).toBeTruthy();
    expect(screen.getByText('Bir fark: Sigara — o “Sosyal içici”, sen “İçmem”')).toBeTruthy();
    await fireEvent.press(screen.getByText('Bunun gibileri daha az göster'));
    // Only reasons the user can down-weight are offered (both_active is not).
    expect(screen.queryByText('both_active')).toBeNull();
    await fireEvent.press(screen.getByText('Bu ilgi alanları'));
    await waitFor(() => expect(m.lessLikeThis).toHaveBeenCalledWith('shared_interests'));
    expect(
      await screen.findByText('Tamam, sonraki Turlarda bunun ağırlığını düşüreceğiz.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Profile dön'));
    expect(screen.getByText('Kişi 1')).toBeTruthy();
  });

  it('passes and saves, then moves to the next card', async () => {
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('Geç'));
    await waitFor(() => expect(m.cardAction).toHaveBeenCalledWith(UUID(1), 'pass'));
    expect(await screen.findByText('Kişi 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Sonraya sakla'));
    await waitFor(() => expect(m.cardAction).toHaveBeenCalledWith(UUID(2), 'save'));
  });

  it('explains the saved limit (§4.1: 9 people)', async () => {
    m.cardAction.mockResolvedValue({ ok: false, error: 'saved_limit' });
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('Sonraya sakla'));
    expect(
      await screen.findByText('En fazla 9 kişi saklayabilirsin. Önce birini çıkar.'),
    ).toBeTruthy();
  });

  it('opens the answer composer for the current card', async () => {
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('Cevapla'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/answer', params: { cardId: UUID(1) } });
  });

  it('shows the decision on a decided card instead of the actions', async () => {
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: tur([card(1), card(2, 'saved')]) },
    });
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('İleri'));
    expect(screen.getByTestId('card-decided')).toBeTruthy();
    await fireEvent.press(screen.getByText('Saklananlardan çıkar'));
    await waitFor(() => expect(m.cardAction).toHaveBeenCalledWith(UUID(2), 'unsave'));
  });

  it('is honest about a small pool and never pads it (§4.1)', async () => {
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: tur([card(1), card(2)], { hint: { widerDistance: 3, widerAge: 0 } }) },
    });
    await renderWithProviders(<TurScreen />);
    expect(
      await screen.findByText(
        'Bugün kriterlerine uyan 2 kişi var. Mesafeyi 10 km artırırsan 3 kişi daha çıkıyor.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Kart 1 / 2')).toBeTruthy();
  });

  it('shows an empty pool with a way to the filters', async () => {
    m.viewTur.mockResolvedValue({ ok: true, data: { ok: true, tur: tur([]) } });
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('Filtreleri aç'));
    expect(router.push).toHaveBeenCalledWith('/filters');
  });

  it('shows "Tur bitti" with the next countdown and no pressure to buy (§4.1)', async () => {
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: tur([card(1, 'answered'), card(2, 'passed')]) },
    });
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByText('Tur bitti')).toBeTruthy();
    expect(screen.getByText(/sa \d+ dk kaldı/)).toBeTruthy();
    expect(screen.queryByText(/Plus|satın/i)).toBeNull();
    await fireEvent.press(screen.getByText('Kartlara yeniden bak'));
    expect(screen.getByText('Kişi 1')).toBeTruthy();
  });
});

describe('TurScreen on demand, no clock (D-063)', () => {
  const finished = () => tur([card(1, 'answered'), card(2, 'passed')]);

  it('offers the next 9 people right away instead of a countdown', async () => {
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: finished(), mode: 'on_demand' },
    });
    m.nextTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: tur(nine()), mode: 'on_demand' },
    });
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByText('Tur bitti')).toBeTruthy();
    expect(screen.queryByText(/sa \d+ dk kaldı/)).toBeNull();
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: tur(nine()), mode: 'on_demand' },
    });
    await fireEvent.press(screen.getByText('Sıradaki 9 kişi'));
    expect(m.nextTur).toHaveBeenCalled();
    expect(await screen.findByText('Kişi 1')).toBeTruthy();
  });

  it('explains a daily limit', async () => {
    m.viewTur.mockResolvedValue({
      ok: true,
      data: { ok: true, tur: finished(), mode: 'on_demand' },
    });
    m.nextTur.mockResolvedValue({ ok: false, error: 'tur_limit' });
    await renderWithProviders(<TurScreen />);
    await fireEvent.press(await screen.findByText('Sıradaki 9 kişi'));
    expect(await screen.findByText(/Bugünlük bu kadar/)).toBeTruthy();
  });

  it('says honestly when nobody new is left, with a way to the filters', async () => {
    m.viewTur.mockResolvedValue({ ok: true, data: { ok: true, tur: null, mode: 'on_demand' } });
    await renderWithProviders(<TurScreen />);
    expect(await screen.findByText('Şu an sana uygun yeni kimse yok')).toBeTruthy();
    expect(screen.queryByText(/açılıyor/)).toBeNull();
    await fireEvent.press(screen.getByText('Filtreleri aç'));
    expect(router.push).toHaveBeenCalledWith('/filters');
    expect(turView(null, new Date(), 'on_demand')).toEqual({ kind: 'none' });
  });
});

// --- Answer composer --------------------------------------------------------------------

describe('AnswerComposerScreen (§4.2, §8.1 #20)', () => {
  beforeEach(() => {
    searchParams.current = { cardId: UUID(1) };
  });

  it('shows the door question and refuses emoji-only text without calling the server', async () => {
    await renderWithProviders(<AnswerComposerScreen />);
    expect(await screen.findByText('Pazar kahvaltısı: serpme mi, simit-çay mı?')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('answer-text'), '😂😂😂😂😂😂😂😂😂😂');
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Yalnızca emoji yetmez; birkaç kelime yaz.')).toBeTruthy();
    expect(m.sendAnswer).not.toHaveBeenCalled();
  });

  it('sends a text answer and confirms', async () => {
    await renderWithProviders(<AnswerComposerScreen />);
    await fireEvent.changeText(
      await screen.findByTestId('answer-text'),
      '  Simit-çay, deniz kenarında!  ',
    );
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Cevabın gitti')).toBeTruthy();
    expect(m.sendAnswer).toHaveBeenCalledWith({
      candidateId: UUID(101),
      text: 'Simit-çay, deniz kenarında!',
    });
  });

  it('warns about copy-paste answers (MAS-03)', async () => {
    m.sendAnswer.mockResolvedValue({
      ok: true,
      data: { ok: true, answerId: UUID(7), warning: 'similar' },
    });
    await renderWithProviders(<AnswerComposerScreen />);
    await fireEvent.changeText(
      await screen.findByTestId('answer-text'),
      'Serpme kahvaltı tabii ki!',
    );
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText(/Son cevapların birbirine çok benziyor/)).toBeTruthy();
  });

  it('explains limits and duplicates (MAS-02, MAS-03)', async () => {
    m.sendAnswer.mockResolvedValue({ ok: false, error: 'answer_limit', reason: 'pending' });
    await renderWithProviders(<AnswerComposerScreen />);
    await fireEvent.changeText(
      await screen.findByTestId('answer-text'),
      'Serpme kahvaltı tabii ki!',
    );
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText(/Yanıt bekleyen 15 cevabın var/)).toBeTruthy();
    m.sendAnswer.mockResolvedValue({ ok: false, error: 'answer_duplicate' });
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText(/Bu kişiye özel bir şey yaz/)).toBeTruthy();
    m.sendAnswer.mockResolvedValue({ ok: false, error: 'text_blocked', reason: 'contact_info' });
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText(/İletişim bilgisi/)).toBeTruthy();
  });

  it('records and sends a voice answer through the quarantine upload', async () => {
    m.requestAnswerVoiceUpload.mockResolvedValue({
      ok: true,
      data: { ok: true, id: UUID(9), bucket: 'quarantine', path: 'u/answers/9.m4a', token: 't' },
    });
    pm.uploadToQuarantine.mockResolvedValue({ ok: true, data: true });
    const view = await renderWithProviders(<AnswerComposerScreen />);
    await fireEvent.press(await screen.findByText('Ses'));
    await fireEvent.press(screen.getByText('Kaydı başlat'));
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    Object.assign(mockRecState, { isRecording: true, durationMillis: 6000 });
    await view.rerender(<AnswerComposerScreen />);
    // The recorder reports "stopped" once Durdur is pressed.
    Object.assign(mockRecState, { isRecording: false });
    await fireEvent.press(screen.getByText('Durdur'));
    await waitFor(() => expect(screen.getByText('Dinle')).toBeTruthy());
    await fireEvent.press(screen.getByText('Gönder'));
    expect(await screen.findByText('Cevabın gitti')).toBeTruthy();
    expect(m.sendAnswer).toHaveBeenCalledWith({ candidateId: UUID(101), voiceId: UUID(9) });
  });

  it('refuses a too-short recording and handles a denied microphone (§8.2)', async () => {
    const view = await renderWithProviders(<AnswerComposerScreen />);
    await fireEvent.press(await screen.findByText('Ses'));
    await fireEvent.press(screen.getByText('Kaydı başlat'));
    await waitFor(() => expect(mockRecorder.record).toHaveBeenCalled());
    Object.assign(mockRecState, { isRecording: true, durationMillis: 1500 });
    await view.rerender(<AnswerComposerScreen />);
    await fireEvent.press(screen.getByText('Durdur'));
    expect(await screen.findByText('Ses kaydı 3–20 saniye olmalı.')).toBeTruthy();
    Object.assign(mockRecState, { isRecording: false });
    mockPermission.granted = false;
    await view.rerender(<AnswerComposerScreen />);
    await fireEvent.press(screen.getByText('Kaydı başlat'));
    expect(await screen.findByTestId('mic-denied')).toBeTruthy();
    expect(screen.getByText('Ayarları aç')).toBeTruthy();
  });

  it('can answer someone from the saved list', async () => {
    searchParams.current = { candidateId: UUID(555) };
    m.listSaved.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        saved: [
          {
            candidateId: UUID(555),
            cardId: UUID(55),
            expiresAt: new Date().toISOString(),
            profile: person('Ece'),
          },
        ],
      },
    });
    await renderWithProviders(<AnswerComposerScreen />);
    expect(await screen.findByText('Ece')).toBeTruthy();
  });

  it('says so when the card is gone', async () => {
    searchParams.current = { cardId: UUID(404) };
    await renderWithProviders(<AnswerComposerScreen />);
    await waitFor(() => expect(m.listSaved).toHaveBeenCalled());
    expect(await screen.findByTestId('answer-missing')).toBeTruthy();
  });
});

// --- Filters and saved -------------------------------------------------------------------

describe('FiltersScreen (§6.6, TUR-09)', () => {
  beforeEach(() => {
    m.fetchPreferences.mockResolvedValue({
      ageMin: 25,
      ageMax: 35,
      distanceKm: null,
      intents: ['long_term', 'serious_unhurried'],
      voiceOnly: false,
    });
    pm.updateSection.mockResolvedValue({ ok: true, data: { ok: true } });
  });

  it('shows the live estimate and warns under 30', async () => {
    m.poolEstimate.mockResolvedValue(12);
    await renderWithProviders(<FiltersScreen />);
    expect(await screen.findByText('Bu filtrelerle yaklaşık 12 kişi var.')).toBeTruthy();
    expect(screen.getByText(/Havuz küçük/)).toBeTruthy();
  });

  it('re-estimates on change and saves the filters', async () => {
    m.poolEstimate.mockResolvedValue(80);
    await renderWithProviders(<FiltersScreen />);
    expect(await screen.findByText('Bu filtrelerle yaklaşık 80 kişi var.')).toBeTruthy();
    expect(screen.queryByText(/Havuz küçük/)).toBeNull();
    await fireEvent.press(screen.getByText('25 km'));
    await fireEvent.press(screen.getByText('Yalnızca ses kartı olanlar'));
    await waitFor(() =>
      expect(m.poolEstimate).toHaveBeenLastCalledWith(
        expect.objectContaining({ distanceKm: 25, voiceOnly: true }),
      ),
    );
    await fireEvent.press(screen.getByText('Kaydet'));
    await waitFor(() =>
      expect(pm.updateSection).toHaveBeenCalledWith({
        section: 'preferences',
        data: {
          ageMin: 25,
          ageMax: 35,
          distanceKm: 25,
          intents: ['long_term', 'serious_unhurried'],
          voiceOnly: true,
        },
      }),
    );
    expect(await screen.findByText(/Kaydedildi\. Bir sonraki Tur/)).toBeTruthy();
  });

  it('requires at least one intent', async () => {
    m.poolEstimate.mockResolvedValue(80);
    await renderWithProviders(<FiltersScreen />);
    await fireEvent.press(await screen.findByText('Uzun ilişki'));
    await fireEvent.press(screen.getByText('Ciddi ama acelesiz'));
    expect(screen.getByText('En az bir niyet seç.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Kaydet'));
    expect(pm.updateSection).not.toHaveBeenCalled();
  });

  it('shows an error with retry when preferences cannot be loaded', async () => {
    m.fetchPreferences.mockRejectedValue(new Error('x'));
    await renderWithProviders(<FiltersScreen />);
    expect(await screen.findByText('Filtreler yüklenemedi.')).toBeTruthy();
  });
});

describe('SavedScreen (§8.1 #45)', () => {
  it('shows the empty state', async () => {
    await renderWithProviders(<SavedScreen />);
    expect(await screen.findByTestId('saved-empty')).toBeTruthy();
  });

  it('lists saved people with time left, opens the profile, answers and removes', async () => {
    m.listSaved.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        saved: [
          {
            candidateId: UUID(555),
            cardId: UUID(55),
            expiresAt: new Date(Date.now() + 2 * 24 * HOUR + 5 * HOUR + 60_000).toISOString(),
            profile: person('Ece'),
          },
        ],
      },
    });
    await renderWithProviders(<SavedScreen />);
    expect(await screen.findByText('2 gün 5 sa kaldı')).toBeTruthy();
    expect(screen.getByText('1 / 9 kişi. Karşı taraf bilmez.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Profili gör'));
    expect(screen.getByText('Pazar kahvaltısı: serpme mi, simit-çay mı?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cevapla'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/answer',
      params: { candidateId: UUID(555) },
    });
    await fireEvent.press(screen.getByText('Saklananlardan çıkar'));
    await waitFor(() => expect(m.cardAction).toHaveBeenCalledWith(UUID(55), 'unsave'));
  });
});
