import { flame } from '@nokuzo/design-tokens';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { usePreferences } from '@/stores/preferences';
import { renderWithProviders } from '@/test/render';
import { Banner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { AppText } from './AppText';
import { Input } from './Input';
import { SegmentedControl } from './SegmentedControl';
import { Sheet } from './Sheet';
import { Skeleton } from './Skeleton';

beforeEach(() => {
  usePreferences.setState({ theme: 'night', language: 'tr', reduceMotion: 'system' });
});

describe('Button', () => {
  it('exposes role, label and calls onPress', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Gönder" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Gönder" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Gönder' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner and reports busy while loading', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Gönder" onPress={onPress} loading />);
    expect(screen.getByTestId('button-spinner')).toBeOnTheScreen();
    expect(screen.getByRole('button')).toBeBusy();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('meets the 44pt minimum touch target', async () => {
    await renderWithProviders(<Button label="Tamam" onPress={() => {}} variant="ghost" />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    async (variant) => {
      await renderWithProviders(<Button label={variant} onPress={() => {}} variant={variant} />);
      expect(screen.getByRole('button', { name: variant })).toBeOnTheScreen();
    },
  );
});

describe('Input', () => {
  it('is labelled and reports typed text', async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(<Input label="Ad" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Ad'), 'Ece');
    expect(onChangeText).toHaveBeenCalledWith('Ece');
  });

  it('shows help text, then the error instead of it', async () => {
    const { rerender } = await renderWithProviders(
      <Input label="Ad" value="" help="Yardım" onChangeText={() => {}} />,
    );
    expect(screen.getByText('Yardım')).toBeOnTheScreen();
    await rerender(
      <Input label="Ad" value="" help="Yardım" error="Hata" onChangeText={() => {}} />,
    );
    expect(screen.getByText('Hata')).toBeOnTheScreen();
    expect(screen.queryByText('Yardım')).toBeNull();
    expect(screen.getByLabelText('Ad').props.accessibilityHint).toBe('Hata');
  });

  it('shows a character counter with a spoken label', async () => {
    await renderWithProviders(
      <Input label="Soru" value="abc" maxLength={90} showCounter onChangeText={() => {}} />,
    );
    expect(screen.getByText('3/90')).toBeOnTheScreen();
    expect(screen.getByLabelText('3 / 90 karakter')).toBeOnTheScreen();
  });
});

describe('Banner', () => {
  it.each(['warning', 'danger'] as const)('announces %s banners as alerts', async (tone) => {
    await renderWithProviders(<Banner tone={tone} message="Dikkat" />);
    expect(screen.getByRole('alert', { name: 'Dikkat' })).toBeOnTheScreen();
  });

  it('renders info banners without alert role', async () => {
    await renderWithProviders(<Banner message="Bilgi" testID="b" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('b')).toHaveAccessibleName('Bilgi');
  });
});

describe('Card and AppText', () => {
  it('draws the warm glass surface of the Alev look (D-065)', async () => {
    await renderWithProviders(
      <Card testID="card">
        <AppText variant="heading">Başlık</AppText>
      </Card>,
    );
    const style = StyleSheet.flatten(screen.getByTestId('card').props.style);
    expect(style.borderColor).toBe(flame.glassBorder);
    expect(screen.getByRole('header', { name: 'Başlık' })).toBeOnTheScreen();
  });
});

describe('SegmentedControl', () => {
  it('marks the selected option and reports changes', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SegmentedControl
        label="Tema"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Sheet', () => {
  it('renders content and closes from the button and the scrim', async () => {
    const onClose = jest.fn();
    await renderWithProviders(
      <Sheet visible title="Sayfa" onClose={onClose}>
        <AppText>İçerik</AppText>
      </Sheet>,
    );
    expect(screen.getByText('İçerik')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Kapat' }));
    // The scrim is hidden from screen readers (accessibilityViewIsModal); they use Close.
    await fireEvent.press(screen.getByTestId('sheet-scrim', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('slides normally and cross-fades with reduce motion on', async () => {
    const { rerender } = await renderWithProviders(
      <Sheet visible title="S" onClose={() => {}}>
        <AppText>x</AppText>
      </Sheet>,
    );
    const modal = () => screen.getByTestId('sheet-modal', { includeHiddenElements: true });
    expect(modal().props.animationType).toBe('slide');
    await act(async () => usePreferences.setState({ reduceMotion: 'on' }));
    await rerender(
      <Sheet visible title="S" onClose={() => {}}>
        <AppText>x</AppText>
      </Sheet>,
    );
    expect(modal().props.animationType).toBe('fade');
  });
});

describe('Skeleton', () => {
  it('is hidden from screen readers', async () => {
    await renderWithProviders(<Skeleton testID="sk" />);
    expect(screen.getByTestId('sk', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('sk')).toBeNull();
  });

  it('renders statically with reduce motion on', async () => {
    usePreferences.setState({ reduceMotion: 'on' });
    await renderWithProviders(<Skeleton testID="sk" height={20} />);
    const style = StyleSheet.flatten(
      screen.getByTestId('sk', { includeHiddenElements: true }).props.style,
    );
    expect(style.height).toBe(20);
  });
});
