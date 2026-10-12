import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import { renderWithProviders } from '@/test/render';
import * as api from './api';
import type { TableGame } from './api';
import { GamePanel, GamePicker } from './GamePanel';

jest.mock('./api');

const m = jest.mocked(api);
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TABLE = UUID(500);
const ME = UUID(900);
const THEM = UUID(901);

const game = (over: Partial<TableGame>): TableGame => ({
  id: UUID(30),
  tableId: TABLE,
  kind: 'word_hunt',
  status: 'active',
  startedBy: ME,
  turnOf: ME,
  state: { guesses: [] },
  version: 1,
  createdAt: new Date().toISOString(),
  ...over,
});
const answered = (g: TableGame) =>
  Promise.resolve({ ok: true as const, data: { ok: true as const, game: g } });
const panel = () => renderWithProviders(<GamePanel tableId={TABLE} me={ME} otherName="Ece" />);

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signed_in', userId: 'u1' });
});

describe('Kelime Avı', () => {
  it('shows the guesses with their marks and sends a guess on my turn', async () => {
    m.fetchLatestGame.mockResolvedValue(
      game({
        state: {
          guesses: [{ by: THEM, word: 'melak', marks: ['near', 'near', 'hit', 'near', 'near'] }],
        },
      }),
    );
    m.guessWord.mockImplementation(() => answered(game({ turnOf: THEM, version: 2 })));
    await panel();
    expect(await screen.findByLabelText('l, doğru yerde')).toBeTruthy();
    const guess = screen.getByRole('button', { name: 'Tahmin et' });
    expect(guess).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('5 harfli tahmin'), 'KALEM');
    await fireEvent.press(guess);
    expect(m.guessWord).toHaveBeenCalledWith(UUID(30), 'kalem');
    expect(await screen.findByText('Sıra onda')).toBeTruthy();
  });

  it('shows the word when the game is lost', async () => {
    m.fetchLatestGame.mockResolvedValue(
      game({ status: 'lost', turnOf: null, state: { guesses: [], answer: 'kalem' } }),
    );
    await panel();
    expect(await screen.findByText('Bu sefer olmadı. Kelime “KALEM” idi.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByTestId('game-panel')).toBeNull();
  });
});

describe('Adam Asmaca', () => {
  const hangman = (over: Partial<TableGame> = {}) =>
    game({
      kind: 'hangman',
      startedBy: THEM,
      state: { setter: THEM, mask: 'k____', guessed: ['k', 'z'], wrong: 1 },
      ...over,
    });

  it('lets the guesser pick letters; used ones are off', async () => {
    m.fetchLatestGame.mockResolvedValue(hangman());
    m.guessLetter.mockImplementation(() => answered(hangman({ version: 2 })));
    await panel();
    expect(await screen.findByLabelText('5 alev kaldı')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'K harfi' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'A harfi' }));
    expect(m.guessLetter).toHaveBeenCalledWith(UUID(30), 'a');
  });

  it('shows the setter only the progress', async () => {
    m.fetchLatestGame.mockResolvedValue(
      hangman({
        startedBy: ME,
        turnOf: THEM,
        state: { setter: ME, mask: 'k____', guessed: ['k'], wrong: 0 },
      }),
    );
    await panel();
    expect(await screen.findAllByText('6 alev kaldı')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'A harfi' })).toBeNull();
  });

  it('shows a refusal from the server', async () => {
    m.fetchLatestGame.mockResolvedValue(hangman());
    m.guessLetter.mockResolvedValue({ ok: false, error: 'game_conflict' });
    await panel();
    await fireEvent.press(await screen.findByRole('button', { name: 'A harfi' }));
    expect(
      await screen.findByText('Aynı anda hamle yapıldı; tahta yenilendi, tekrar dene.'),
    ).toBeTruthy();
  });
});

describe('İsim-Şehir-Hayvan', () => {
  it('sends answers once', async () => {
    const cats = (state: TableGame['state'], over: Partial<TableGame> = {}) =>
      game({ kind: 'categories', turnOf: null, state, ...over });
    m.fetchLatestGame.mockResolvedValue(cats({ letter: 'k', submitted: [THEM] }));
    m.sendAnswers.mockImplementation(() =>
      answered(cats({ letter: 'k', submitted: [THEM, ME] }, { version: 2 })),
    );
    await panel();
    expect(await screen.findByText('Ece cevaplarını gönderdi.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Şehir'), 'Kars');
    await fireEvent.press(screen.getByRole('button', { name: 'Cevaplarımı gönder' }));
    expect(m.sendAnswers).toHaveBeenCalledWith(UUID(30), { city: 'Kars' });
  });

  it('shows both sides with points once both have sent', async () => {
    const cats = (state: TableGame['state'], over: Partial<TableGame> = {}) =>
      game({ kind: 'categories', turnOf: null, state, ...over });
    m.fetchLatestGame.mockResolvedValue(
      cats(
        {
          letter: 'k',
          submitted: [THEM, ME],
          answers: { [ME]: { city: 'Kars' }, [THEM]: { city: 'Konya' } },
          scores: {
            [ME]: { name: 0, city: 10, animal: 0, plant: 0, thing: 0 },
            [THEM]: { name: 0, city: 10, animal: 0, plant: 0, thing: 0 },
          },
          totals: { [ME]: 10, [THEM]: 10 },
        },
        { status: 'finished', version: 3 },
      ),
    );
    await panel();
    expect(await screen.findByText('Kars · 10')).toBeTruthy();
    expect(screen.getByText('Konya · 10')).toBeTruthy();
    expect(screen.getByText('Ece: 10 puan')).toBeTruthy();
  });
});

describe('GamePicker', () => {
  it('starts Adam Asmaca with a hidden word', async () => {
    m.fetchLatestGame.mockResolvedValue(null);
    m.startTableGame.mockImplementation(() => answered(game({ kind: 'hangman' })));
    const onClose = jest.fn();
    await renderWithProviders(<GamePicker tableId={TABLE} visible onClose={onClose} />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Adam Asmaca' }));
    const start = screen.getByRole('button', { name: 'Başlat' });
    await fireEvent.changeText(screen.getByLabelText('Kelimen (4–12 harf)'), 'kar');
    expect(start).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Kelimen (4–12 harf)'), 'Kahve');
    await fireEvent.press(start);
    expect(m.startTableGame).toHaveBeenCalledWith(TABLE, 'hangman', 'Kahve');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('starts Kelime Avı without a word and shows "busy"', async () => {
    m.fetchLatestGame.mockResolvedValue(null);
    m.startTableGame.mockResolvedValue({ ok: false, error: 'game_busy' });
    await renderWithProviders(<GamePicker tableId={TABLE} visible onClose={jest.fn()} />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Kelime Avı' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Başlat' }));
    expect(m.startTableGame).toHaveBeenCalledWith(TABLE, 'word_hunt', undefined);
    expect(await screen.findByText('Bu masada zaten süren bir oyun var.')).toBeTruthy();
  });
});
