import { colors } from '@nokuzo/design-tokens';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import i18n from '@/i18n';
import { usePreferences } from '@/stores/preferences';
import { renderWithProviders } from '@/test/render';
import { FoundationScreen } from './FoundationScreen';

function background() {
  return StyleSheet.flatten(screen.getByTestId('foundation').props.style).backgroundColor;
}

beforeEach(async () => {
  usePreferences.setState({ theme: 'system', language: 'tr', reduceMotion: 'system' });
  await act(async () => {
    await i18n.changeLanguage('tr');
  });
});

describe('FoundationScreen — Phase 0 acceptance: theme and language switch', () => {
  it('starts in Turkish, following the system color scheme (light in the test renderer)', async () => {
    await renderWithProviders(<FoundationScreen />);
    expect(screen.getByText('Her akşam dokuzda, dokuz kişi.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Sistem' })).toBeSelected();
    expect(background()).toBe(colors.day.bgBase);
  });

  it('switches to the day theme and back', async () => {
    await renderWithProviders(<FoundationScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Gündüz' }));
    expect(usePreferences.getState().theme).toBe('day');
    expect(background()).toBe(colors.day.bgBase);
    await fireEvent.press(screen.getByRole('radio', { name: 'Gece' }));
    expect(background()).toBe(colors.night.bgBase);
  });

  it('switches the language to English', async () => {
    await renderWithProviders(<FoundationScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    expect(usePreferences.getState().language).toBe('en');
    // RootLayout applies the store value to i18next; do the same here.
    await act(async () => {
      await i18n.changeLanguage(usePreferences.getState().language);
    });
    expect(screen.getByText('Every evening at nine, nine people.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Day' })).toBeOnTheScreen();
  });

  it('stores the reduce-motion override', async () => {
    await renderWithProviders(<FoundationScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Açık' }));
    expect(usePreferences.getState().reduceMotion).toBe('on');
  });

  it('validates the sample input with a translated error', async () => {
    await renderWithProviders(<FoundationScreen />);
    await fireEvent.changeText(screen.getByLabelText('Kapı Sorusu'), 'kısa');
    expect(screen.getByText('En az 10 karakter yaz.')).toBeOnTheScreen();
  });

  it('opens and closes the sheet', async () => {
    await renderWithProviders(<FoundationScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sayfayı aç' }));
    expect(
      screen.getByText('Kapat düğmesiyle ya da geri hareketiyle kapatılır.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Kapat düğmesiyle ya da geri hareketiyle kapatılır.')).toBeNull();
  });

  it('shows unconfigured services as NEEDS_SETUP, never as ready', async () => {
    await renderWithProviders(<FoundationScreen />);
    expect(screen.getAllByText('NEEDS_SETUP')).toHaveLength(2);
    expect(screen.queryByText('ready')).toBeNull();
  });
});
