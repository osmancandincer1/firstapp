import { CONSENT_TYPES } from '@nokuzo/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { router, resetRouter } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import * as api from './api';
import { AGE_LOCK_KEY, BirthDateScreen, daysInMonth, toIsoDate } from './BirthDateScreen';
import { ConsentsScreen } from './ConsentsScreen';
import { LivenessScreen } from './LivenessScreen';
import { PhoneScreen } from './PhoneScreen';
import { BlockedScreen, NeedsIdScreen } from './StatusScreens';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('./api');
const mocked = jest.mocked(api);

beforeEach(() => {
  resetRouter();
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('PhoneScreen', () => {
  it('normalizes the number and moves to the code screen', async () => {
    mocked.requestPhoneCode.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<PhoneScreen />);
    expect(screen.getByRole('progressbar', { name: 'Adım 1 / 10' })).toBeOnTheScreen();
    const send = screen.getByRole('button', { name: 'Kod gönder' });
    await fireEvent.changeText(screen.getByLabelText('Cep telefonu'), '0532');
    expect(send).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Cep telefonu'), '0532 123 45 67');
    await fireEvent.press(send);
    expect(mocked.requestPhoneCode).toHaveBeenCalledWith('+905321234567');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/code',
      params: { channel: 'phone', target: '+905321234567' },
    });
  });

  it('explains why a VoIP number is refused (AUTH-04)', async () => {
    mocked.requestPhoneCode.mockResolvedValue({ ok: false, error: 'voip_number' });
    await renderWithProviders(<PhoneScreen />);
    await fireEvent.changeText(screen.getByLabelText('Cep telefonu'), '05321234567');
    await fireEvent.press(screen.getByRole('button', { name: 'Kod gönder' }));
    expect(
      screen.getByText('Sanal (VoIP) numaralar kabul edilmiyor. Cep telefonu numaranı gir.'),
    ).toBeOnTheScreen();
  });
});

describe('BirthDateScreen (AUTH-01)', () => {
  const MONTHS = [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
  ];
  const choose = (wheel: string, label: string) =>
    fireEvent.press(
      within(screen.getByTestId(`wheel-${wheel}`)).getByText(label, {
        includeHiddenElements: true,
      }),
    );
  const fill = async (d: string, m: string, y: string) => {
    await choose('day', d);
    await choose('month', MONTHS[Number(m) - 1]!);
    await choose('year', y);
  };

  it('builds ISO dates and knows month lengths', () => {
    expect(toIsoDate('7', '5', '1990')).toBe('1990-05-07');
    expect(toIsoDate('', '5', '1990')).toBeNull();
    expect(toIsoDate('7', '5', '90')).toBeNull();
    expect(daysInMonth(2, 1990)).toBe(28);
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2, null)).toBe(29);
    expect(daysInMonth(4, 1990)).toBe(30);
  });

  it('starts with nothing chosen, so no default date can be sent by accident', async () => {
    await renderWithProviders(<BirthDateScreen />);
    expect(screen.getByLabelText('Gün')).toHaveAccessibilityValue({ text: '—' });
    expect(screen.getByRole('button', { name: 'Devam' })).toBeDisabled();
  });

  it('submits an adult date and returns to the gate', async () => {
    mocked.submitBirthDate.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<BirthDateScreen />);
    await fill('7', '5', '1990');
    expect(screen.getByTestId('birth-date-summary')).toHaveTextContent(
      /^7 Mayıs 1990 · \d+ yaşındasın$/,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(mocked.submitBirthDate).toHaveBeenCalledWith('1990-05-07');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('keeps the day valid when the month or year changes (no 31 February)', async () => {
    await renderWithProviders(<BirthDateScreen />);
    await choose('day', '31');
    await choose('month', 'Şubat');
    expect(screen.getByLabelText('Gün')).toHaveAccessibilityValue({ text: '29' });
    await choose('year', '1990');
    expect(screen.getByLabelText('Gün')).toHaveAccessibilityValue({ text: '28' });
    expect(screen.queryByText('Geçerli bir tarih gir.')).toBeNull();
  });

  it('can be used with a screen reader (adjustable wheels)', async () => {
    await renderWithProviders(<BirthDateScreen />);
    const day = screen.getByLabelText('Gün');
    expect(day).toHaveProp('accessibilityRole', 'adjustable');
    await fireEvent(day, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent(day, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(day).toHaveAccessibilityValue({ text: '2' });
    await fireEvent(day, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(day).toHaveAccessibilityValue({ text: '1' });
  });

  it('sends an under-age date to the server, then locks this device for 24 hours', async () => {
    const until = new Date(Date.now() + 24 * 3_600_000).toISOString();
    mocked.submitBirthDate.mockResolvedValue({ ok: false, error: 'underage', retryAt: until });
    await renderWithProviders(<BirthDateScreen />);
    const now = new Date();
    await fill(String(now.getDate()), String(now.getMonth() + 1), String(now.getFullYear() - 16));
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(mocked.submitBirthDate).toHaveBeenCalled();
    expect(await SecureStore.getItemAsync(AGE_LOCK_KEY)).toBe(until);
    expect(screen.getByTestId('age-locked')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Devam' })).toBeDisabled();
  });

  it('respects an existing device lock after restart', async () => {
    await SecureStore.setItemAsync(AGE_LOCK_KEY, new Date(Date.now() + 3_600_000).toISOString());
    await renderWithProviders(<BirthDateScreen />);
    expect(await screen.findByTestId('age-locked')).toBeOnTheScreen();
    await fill('7', '5', '1990');
    expect(screen.getByRole('button', { name: 'Devam' })).toBeDisabled();
  });
});

describe('ConsentsScreen (AUTH-07)', () => {
  const docs = CONSENT_TYPES.map((type) => ({
    type,
    version: 'draft-1',
    url: null,
    is_draft: true,
  }));

  it('shows every consent unchecked and requires all mandatory ones', async () => {
    mocked.fetchLegalDocuments.mockResolvedValue({ ok: true, data: docs });
    mocked.submitConsents.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<ConsentsScreen />);
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(CONSENT_TYPES.length);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getAllByText(/TASLAK/).length).toBe(CONSENT_TYPES.length);

    const submit = screen.getByRole('button', { name: 'Onayla ve devam et' });
    expect(submit).toBeDisabled();
    for (const type of CONSENT_TYPES.filter((t) => t !== 'marketing')) {
      await fireEvent.press(screen.getByTestId(`consent-${type}`));
    }
    expect(submit).toBeEnabled();
    await fireEvent.press(submit);
    expect(mocked.submitConsents).toHaveBeenCalledWith(
      CONSENT_TYPES.map((type) => ({ type, version: 'draft-1', granted: type !== 'marketing' })),
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('offers a retry when the documents cannot be loaded', async () => {
    mocked.fetchLegalDocuments.mockResolvedValueOnce({ ok: false, error: 'network' });
    mocked.fetchLegalDocuments.mockResolvedValueOnce({ ok: true, data: docs });
    await renderWithProviders(<ConsentsScreen />);
    expect(await screen.findByText('Metinler yüklenemedi.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findAllByRole('checkbox')).toHaveLength(CONSENT_TYPES.length);
  });

  it('stays closed when no documents are in force', async () => {
    mocked.fetchLegalDocuments.mockResolvedValue({ ok: true, data: [] });
    await renderWithProviders(<ConsentsScreen />);
    expect(
      await screen.findByText('Bu özellik şu an kullanılamıyor. Biraz sonra yeniden dene.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Onayla ve devam et' })).toBeDisabled();
  });
});

describe('LivenessScreen (§6.2)', () => {
  it('completes with the local mock provider, clearly marked as development', async () => {
    mocked.startLiveness.mockResolvedValue({
      ok: true,
      data: { ok: true, sessionId: 's-1', provider: 'mock' },
    });
    mocked.completeLiveness.mockResolvedValue({ ok: true, data: { ok: true, outcome: 'passed' } });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamaya başla' }));
    expect(screen.getByTestId('liveness-dev')).toBeOnTheScreen();
    expect(screen.getByText(/GELİŞTİRME/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamayı tamamla' }));
    expect(mocked.completeLiveness).toHaveBeenCalledWith('s-1');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('sends blocked outcomes to the generic refusal screen', async () => {
    mocked.startLiveness.mockResolvedValue({
      ok: true,
      data: { ok: true, sessionId: 's-1', provider: 'mock' },
    });
    mocked.completeLiveness.mockResolvedValue({ ok: true, data: { ok: true, outcome: 'blocked' } });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamaya başla' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamayı tamamla' }));
    expect(router.replace).toHaveBeenCalledWith('/blocked');
  });

  it('shows the cooldown after the third failure (VER-01)', async () => {
    mocked.startLiveness.mockResolvedValue({
      ok: true,
      data: { ok: true, sessionId: 's-1', provider: 'mock' },
    });
    mocked.completeLiveness.mockResolvedValue({
      ok: true,
      data: { ok: true, outcome: 'failed', retryAt: '2026-10-12T12:00:00Z' },
    });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamaya başla' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamayı tamamla' }));
    expect(
      screen.getByText(/Çok sayıda başarısız deneme oldu\. .+ sonra yeniden deneyebilirsin/),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Doğrulamaya başla' })).toBeDisabled();
  });

  it('a failure without cooldown invites another try', async () => {
    mocked.startLiveness.mockResolvedValue({
      ok: true,
      data: { ok: true, sessionId: 's-1', provider: 'mock' },
    });
    mocked.completeLiveness.mockResolvedValue({ ok: true, data: { ok: true, outcome: 'failed' } });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamaya başla' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamayı tamamla' }));
    expect(
      screen.getByText('Doğrulama tamamlanamadı. Işığı kontrol edip yeniden dene.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Doğrulamaya başla' })).toBeEnabled();
  });

  it('says honestly that the real camera is not in this build (AWS, NEEDS_SETUP)', async () => {
    mocked.startLiveness.mockResolvedValue({
      ok: true,
      data: { ok: true, sessionId: 's-1', provider: 'aws' },
    });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamaya başla' }));
    expect(screen.getByText('Canlılık kamerası bu sürümde henüz hazır değil.')).toBeOnTheScreen();
  });

  it('shows a cooldown returned when starting, and service errors', async () => {
    mocked.startLiveness.mockResolvedValueOnce({
      ok: false,
      error: 'liveness_cooldown',
      retryAt: '2026-10-12T12:00:00Z',
    });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrulamaya başla' }));
    expect(screen.getByText(/sonra yeniden deneyebilirsin/)).toBeOnTheScreen();

    mocked.startLiveness.mockResolvedValueOnce({ ok: false, error: 'service_unavailable' });
    await renderWithProviders(<LivenessScreen />);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Doğrulamaya başla' }).at(-1)!);
    expect(
      screen.getByText('Bu özellik şu an kullanılamıyor. Biraz sonra yeniden dene.'),
    ).toBeOnTheScreen();
  });
});

describe('status screens', () => {
  it('blocked and needs-id never name the reason, and point to support', async () => {
    await renderWithProviders(<BlockedScreen />);
    expect(
      screen.getByText(/Bu bilgilerle hesap oluşturulamıyor\. Yardım için destek@nokuzo\.com/),
    ).toBeOnTheScreen();
    await renderWithProviders(<NeedsIdScreen />);
    expect(screen.getByText('Destek: destek@nokuzo.com')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Çıkış yap' }).length).toBeGreaterThan(0);
  });
});
