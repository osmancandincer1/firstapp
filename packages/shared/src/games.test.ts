import {
  applyMove,
  CATEGORY_LETTERS,
  gameActionSchema,
  type CategoriesState,
  type GameRecord,
  type HangmanState,
  letters,
  markGuess,
  scoreCategories,
  startGame,
  TR_ALPHABET,
  WORD_HUNT_WORDS,
  WORD_LENGTH,
  type WordHuntState,
} from './games.ts';

const A = 'a-id';
const B = 'b-id';
const first = (xs: readonly string[]) => xs[0]!;
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const gid = '00000000-0000-4000-8000-000000000001';

describe('letters', () => {
  it('lower-cases the Turkish way and keeps only letters', () => {
    expect(letters(' İSTANBUL 34! ')).toBe('istanbul');
    expect(letters('IĞDIR')).toBe('ığdır');
    expect(TR_ALPHABET).toHaveLength(29);
  });
});

describe('Kelime Avı', () => {
  it('has five-letter lowercase Turkish secrets, no repeats', () => {
    expect(WORD_HUNT_WORDS.length).toBeGreaterThan(100);
    for (const w of WORD_HUNT_WORDS) {
      expect([...w]).toHaveLength(WORD_LENGTH);
      expect(letters(w)).toBe(w);
    }
    expect(new Set(WORD_HUNT_WORDS).size).toBe(WORD_HUNT_WORDS.length);
  });

  it('marks hits, near letters and misses, counting repeats once', () => {
    expect(markGuess('kalem', 'kalem')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    expect(markGuess('melak', 'kalem')).toEqual(['near', 'near', 'hit', 'near', 'near']);
    // Only one "a" left after the hit: the second extra "a" is a miss.
    expect(markGuess('aaaxa', 'araba')).toEqual(['hit', 'miss', 'hit', 'miss', 'hit']);
    expect(markGuess('ççççç', 'çiçek')).toEqual(['hit', 'miss', 'hit', 'miss', 'miss']);
  });

  it('is played in turns and won together', () => {
    let g = ok(startGame('word_hunt', A, B, { pick: () => 'kalem' })).game;
    expect(g.turnOf).toBe(A);
    expect(applyMove(g, B, A, { action: 'guess', gameId: gid, word: 'kalem' })).toEqual({
      ok: false,
      error: 'not_your_turn',
    });
    expect(applyMove(g, A, B, { action: 'guess', gameId: gid, word: 'kale' })).toEqual({
      ok: false,
      error: 'invalid_move',
    });
    g = ok(applyMove(g, A, B, { action: 'guess', gameId: gid, word: 'MELAK' })).game;
    expect(g.turnOf).toBe(B);
    expect((g.state as WordHuntState).answer).toBeUndefined();
    g = ok(applyMove(g, B, A, { action: 'guess', gameId: gid, word: 'Kalem' })).game;
    expect(g.status).toBe('won');
    expect((g.state as WordHuntState).answer).toBe('kalem');
    expect(applyMove(g, A, B, { action: 'guess', gameId: gid, word: 'kalem' })).toEqual({
      ok: false,
      error: 'game_over',
    });
  });

  it('is lost after six tries and then shows the word', () => {
    let g = ok(startGame('word_hunt', A, B, { pick: () => 'kalem' })).game;
    for (let i = 0; i < 6; i++) {
      const [me, other] = i % 2 ? [B, A] : [A, B];
      g = ok(applyMove(g, me, other, { action: 'guess', gameId: gid, word: 'deniz' })).game;
    }
    expect(g.status).toBe('lost');
    expect((g.state as WordHuntState).answer).toBe('kalem');
  });
});

describe('Adam Asmaca', () => {
  it('needs a 4–12 letter word from the starter; the other guesses', () => {
    expect(startGame('hangman', A, B, { word: 'kar' })).toEqual({
      ok: false,
      error: 'invalid_word',
    });
    expect(startGame('hangman', A, B, { word: 'x'.repeat(13) }).ok).toBe(false);
    const g = ok(startGame('hangman', A, B, { word: ' Kahve ' })).game;
    expect(g.turnOf).toBe(B);
    expect(g.state).toEqual({ setter: A, mask: '_____', guessed: [], wrong: 0 });
    expect(applyMove(g, A, B, { action: 'letter', gameId: gid, letter: 'k' })).toEqual({
      ok: false,
      error: 'not_your_turn',
    });
  });

  it('reveals letters, counts misses and ends either way', () => {
    let g = ok(startGame('hangman', A, B, { word: 'kahve' })).game;
    const guess = (x: GameRecord, letter: string) =>
      applyMove(x, B, A, { action: 'letter', gameId: gid, letter });
    g = ok(guess(g, 'K')).game;
    expect((g.state as HangmanState).mask).toBe('k____');
    expect(guess(g, 'k')).toEqual({ ok: false, error: 'invalid_move' });
    expect(guess(g, 'ab')).toEqual({ ok: false, error: 'invalid_move' });
    g = ok(guess(g, 'z')).game;
    expect((g.state as HangmanState).wrong).toBe(1);
    for (const c of ['a', 'h', 'v', 'e']) g = ok(guess(g, c)).game;
    expect(g.status).toBe('won');
    expect((g.state as HangmanState).answer).toBe('kahve');

    let l = ok(startGame('hangman', A, B, { word: 'kahve' })).game;
    for (const c of ['b', 'c', 'ç', 'd', 'f', 'g']) l = ok(guess(l, c)).game;
    expect(l.status).toBe('lost');
    expect((l.state as HangmanState).answer).toBe('kahve');
  });
});

describe('İsim-Şehir-Hayvan', () => {
  it('scores 10 for unique, 5 for the same, 0 for empty or wrong letter', () => {
    const r = scoreCategories(
      'k',
      { id: A, answers: { name: 'Kerem', city: 'Kars', animal: 'kedi', plant: 'nane' } },
      { id: B, answers: { name: 'KEREM', city: 'Konya', animal: 'kartal', thing: 'k' } },
    );
    expect(r.scores![A]).toEqual({ name: 5, city: 10, animal: 10, plant: 0, thing: 0 });
    expect(r.scores![B]).toEqual({ name: 5, city: 10, animal: 10, plant: 0, thing: 0 });
    expect(r.totals).toEqual({ [A]: 25, [B]: 25 });
  });

  it('keeps answers secret until both have handed in', () => {
    let g = ok(startGame('categories', A, B, { pick: first })).game;
    expect((g.state as CategoriesState).letter).toBe(first(CATEGORY_LETTERS));
    g = ok(
      applyMove(g, A, B, { action: 'answers', gameId: gid, answers: { name: ' Ali ', city: '' } }),
    ).game;
    expect(g.state).toEqual({ letter: 'a', submitted: [A] });
    expect(g.secret.answers).toEqual({ [A]: { name: 'Ali' } });
    expect(applyMove(g, A, B, { action: 'answers', gameId: gid, answers: {} })).toEqual({
      ok: false,
      error: 'invalid_move',
    });
    g = ok(
      applyMove(g, B, A, {
        action: 'answers',
        gameId: gid,
        answers: { name: 'Ayşe', city: 'Adana' },
      }),
    ).game;
    const s = g.state as CategoriesState;
    expect(g.status).toBe('finished');
    expect(s.answers).toEqual({ [A]: { name: 'Ali' }, [B]: { name: 'Ayşe', city: 'Adana' } });
    expect(s.totals).toEqual({ [A]: 10, [B]: 20 });
  });
});

describe('moves', () => {
  it('can be abandoned, which reveals the word', () => {
    const g = ok(startGame('hangman', A, B, { word: 'kahve' })).game;
    const r = ok(applyMove(g, A, B, { action: 'abandon', gameId: gid })).game;
    expect(r.status).toBe('abandoned');
    expect((r.state as HangmanState).answer).toBe('kahve');
    const c = ok(startGame('categories', A, B, { pick: first })).game;
    expect(ok(applyMove(c, A, B, { action: 'abandon', gameId: gid })).game.state).toEqual(c.state);
  });

  it('refuses a move of the wrong game and parses actions', () => {
    const g = ok(startGame('word_hunt', A, B, { pick: () => 'kalem' })).game;
    expect(applyMove(g, A, B, { action: 'letter', gameId: gid, letter: 'k' })).toEqual({
      ok: false,
      error: 'invalid_move',
    });
    expect(startGame('word_hunt', A, B).ok).toBe(true);
    expect(
      gameActionSchema.safeParse({ action: 'start', tableId: gid, kind: 'chess' }).success,
    ).toBe(false);
    expect(gameActionSchema.safeParse({ action: 'letter', gameId: gid, letter: 'ş' }).success).toBe(
      true,
    );
  });
});
