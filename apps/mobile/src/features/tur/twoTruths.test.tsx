import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';
import { TwoTruthsGame } from './TwoTruthsGame';

const statements = ['Hiç deniz görmedim.', 'Üç kez Kars’a gittim.', 'Fotoğrafım dergide çıktı.'];

describe('TwoTruthsGame (D-066)', () => {
  it('reveals the lie after a right guess and locks the answers', async () => {
    await renderWithProviders(<TwoTruthsGame statements={statements} lie={1} />);
    await fireEvent.press(screen.getByRole('button', { name: statements[1] }));
    expect(screen.getByText('Bildin! Yalan buydu.')).toBeOnTheScreen();
    const lie = screen.getByRole('button', { name: `${statements[1]}. Yalan` });
    expect(lie).toBeDisabled();
    expect(screen.getByRole('button', { name: `${statements[0]}. Doğru` })).toBeDisabled();
  });

  it('says so after a wrong guess and still marks the lie', async () => {
    await renderWithProviders(<TwoTruthsGame statements={statements} lie={2} />);
    await fireEvent.press(screen.getByRole('button', { name: statements[0] }));
    expect(screen.getByText('Bu doğruymuş. Yalanı işaretledik.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `${statements[2]}. Yalan` })).toBeOnTheScreen();
  });
});
