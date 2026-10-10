import { act, fireEvent, screen } from '@testing-library/react-native';

import { router, resetRouter, searchParams } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import * as api from '@/features/onboarding/api';
import { adoptSession } from './session';
import { CodeScreen, RESEND_SECONDS } from './CodeScreen';
import { EmailScreen } from './EmailScreen';
import { SignInScreen } from './SignInScreen';
import { WelcomeScreen } from './WelcomeScreen';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('@/features/onboarding/api');
jest.mock('./session', () => ({
  ...jest.requireActual('./session'),
  adoptSession: jest.fn(() => Promise.resolve(true)),
}));
const mocked = jest.mocked(api);

beforeEach(() => {
  resetRouter();
  jest.clearAllMocks();
});

describe('WelcomeScreen', () => {
  it('walks through three cards, then goes to sign-in', async () => {
    await renderWithProviders(<WelcomeScreen />);
    expect(screen.getByText('Tur')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'İleri' }));
    expect(screen.getByText('Kapı Sorusu')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByText('Tur')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'İleri' }));
    await fireEvent.press(screen.getByRole('button', { name: 'İleri' }));
    expect(screen.getByText('Masa')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Atla' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Başla' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('can be skipped', async () => {
    await renderWithProviders(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Atla' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });
});

describe('SignInScreen', () => {
  it('offers email sign-in', async () => {
    await renderWithProviders(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'E-posta ile devam et' }));
    expect(router.push).toHaveBeenCalledWith('/email');
  });
});

describe('EmailScreen', () => {
  it('enables sending only for a valid address and moves to the code screen', async () => {
    mocked.requestEmailCode.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<EmailScreen />);
    const send = screen.getByRole('button', { name: 'Kod gönder' });
    expect(send).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('E-posta'), ' ece@example.com ');
    expect(send).toBeEnabled();
    await fireEvent.press(send);
    expect(mocked.requestEmailCode).toHaveBeenCalledWith('ece@example.com');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/code',
      params: { channel: 'email', target: 'ece@example.com' },
    });
  });

  it('shows the server reason, e.g. disposable addresses', async () => {
    mocked.requestEmailCode.mockResolvedValue({ ok: false, error: 'disposable_email' });
    await renderWithProviders(<EmailScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'x@mailinator.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Kod gönder' }));
    expect(
      screen.getByText('Tek kullanımlık e-posta adresleri kabul edilmiyor.'),
    ).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows the offline state', async () => {
    mocked.requestEmailCode.mockResolvedValue({ ok: false, error: 'network' });
    await renderWithProviders(<EmailScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'a@b.co');
    await fireEvent.press(screen.getByRole('button', { name: 'Kod gönder' }));
    expect(screen.getByText('İnternet bağlantısı yok. Bağlanınca yeniden dene.')).toBeOnTheScreen();
  });
});

describe('CodeScreen', () => {
  it('verifies an email code, stores the session and returns to the gate', async () => {
    searchParams.current = { channel: 'email', target: 'ece@example.com' };
    mocked.verifyEmailCode.mockResolvedValue({
      ok: true,
      data: { ok: true, session: { access_token: 'a', refresh_token: 'r' } },
    });
    await renderWithProviders(<CodeScreen />);
    expect(
      screen.getByText('ece@example.com adresine gönderdiğimiz 6 haneli kodu yaz.'),
    ).toBeOnTheScreen();
    const verify = screen.getByRole('button', { name: 'Doğrula' });
    await fireEvent.changeText(screen.getByLabelText('Doğrulama kodu'), '12 34a5');
    expect(verify).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Doğrulama kodu'), '123456');
    await fireEvent.press(verify);
    expect(mocked.verifyEmailCode).toHaveBeenCalledWith({
      email: 'ece@example.com',
      code: '123456',
    });
    expect(adoptSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('verifies a phone code and shows wrong-code errors', async () => {
    searchParams.current = { channel: 'phone', target: '+905321234567' };
    mocked.verifyPhoneCode.mockResolvedValueOnce({ ok: false, error: 'otp_invalid' });
    await renderWithProviders(<CodeScreen />);
    await fireEvent.changeText(screen.getByLabelText('Doğrulama kodu'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrula' }));
    expect(mocked.verifyPhoneCode).toHaveBeenCalledWith({ phone: '+905321234567', code: '000000' });
    expect(screen.getByText('Kod yanlış. Yeniden dene.')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('allows a resend only after the countdown', async () => {
    jest.useFakeTimers();
    try {
      searchParams.current = { channel: 'email', target: 'a@b.co' };
      mocked.requestEmailCode.mockResolvedValue({ ok: true, data: { ok: true } });
      await renderWithProviders(<CodeScreen />);
      expect(
        screen.getByRole('button', { name: `${RESEND_SECONDS} sn sonra yeniden gönderebilirsin` }),
      ).toBeDisabled();
      for (let i = 0; i < RESEND_SECONDS; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      await fireEvent.press(screen.getByRole('button', { name: 'Kodu yeniden gönder' }));
      expect(mocked.requestEmailCode).toHaveBeenCalledWith('a@b.co');
      expect(screen.getByText('Yeni kod gönderildi.')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets the user go back to change the address', async () => {
    searchParams.current = { channel: 'email', target: 'a@b.co' };
    await renderWithProviders(<CodeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bilgiyi değiştir' }));
    expect(router.back).toHaveBeenCalled();
  });
});
