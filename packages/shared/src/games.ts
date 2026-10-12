/**
 * Mini games at a table (owner's decision D-064, rules D-068): "Kelime Avı",
 * "Adam Asmaca" and "İsim-Şehir-Hayvan". Original names and rules built on
 * well-known, unprotected mechanics. The server keeps the secret part
 * (the word, unrevealed answers) and runs these functions on every move; the
 * app runs the same ones to draw the board.
 */
import { z } from 'zod';

export const GAME_KINDS = ['word_hunt', 'hangman', 'categories'] as const;
export type GameKind = (typeof GAME_KINDS)[number];
export type GameStatus = 'active' | 'won' | 'lost' | 'finished' | 'abandoned';

/** Turkish letters in alphabet order. */
export const TR_ALPHABET = [...'abcçdefgğhıijklmnoöprsştuüvyz'];

/** Lower-cases the Turkish way; everything that is not a Turkish letter is dropped. */
export function letters(raw: string): string {
  return [...raw.trim().toLocaleLowerCase('tr')].filter((c) => TR_ALPHABET.includes(c)).join('');
}

// --- Kelime Avı ------------------------------------------------------------------------------

export const WORD_LENGTH = 5;
export const WORD_HUNT_TRIES = 6;

/** Everyday five-letter words used as secrets (guesses can be any five letters). */
export const WORD_HUNT_WORDS = [
  'araba',
  'bahçe',
  'balık',
  'bilet',
  'bulut',
  'cadde',
  'çanta',
  'çiçek',
  'çorba',
  'damla',
  'deniz',
  'dünya',
  'fener',
  'fidan',
  'gölge',
  'güneş',
  'hamak',
  'hayal',
  'ırmak',
  'iklim',
  'insan',
  'kahve',
  'kalem',
  'kavun',
  'kemer',
  'kiraz',
  'kitap',
  'köprü',
  'kumaş',
  'lamba',
  'limon',
  'masal',
  'meyve',
  'müzik',
  'nehir',
  'orman',
  'pasta',
  'pazar',
  'perde',
  'radyo',
  'resim',
  'roman',
  'saray',
  'sabah',
  'sahil',
  'salon',
  'sokak',
  'şehir',
  'şeker',
  'şarkı',
  'tarla',
  'tavuk',
  'vapur',
  'yatak',
  'yazar',
  'yemek',
  'yolcu',
  'zaman',
  'ayran',
  'çilek',
  'dolap',
  'duvar',
  'ekmek',
  'fırın',
  'havuz',
  'keman',
  'sepet',
  'simit',
  'tatil',
  'yayla',
  'ceviz',
  'çatal',
  'kaşık',
  'tabak',
  'bıçak',
  'dalga',
  'köpük',
  'liman',
  'akşam',
  'öğlen',
  'bahar',
  'eylül',
  'kasım',
  'nisan',
  'mayıs',
  'şubat',
  'kuzey',
  'güney',
  'sevgi',
  'gülüş',
  'komşu',
  'davet',
  'düğün',
  'sahne',
  'gitar',
  'davul',
  'zurna',
  'aslan',
  'tilki',
  'ördek',
  'horoz',
  'koyun',
  'yunus',
  'zebra',
  'panda',
  'kirpi',
  'serçe',
  'martı',
  'şahin',
  'armut',
  'incir',
  'vişne',
  'havuç',
  'soğan',
  'biber',
  'pilav',
  'köfte',
  'börek',
  'lokum',
  'helva',
  'kekik',
  'salep',
  'kumru',
  'mango',
  'mısır',
  'kamış',
  'çadır',
  'bavul',
];

export type Mark = 'hit' | 'near' | 'miss';

/**
 * Colours a guess against the secret: right place, wrong place, or not in the
 * word. A letter is marked "near" only as many times as it is still unused.
 */
export function markGuess(guess: string, secret: string): Mark[] {
  const g = [...guess];
  const s = [...secret];
  const marks: Mark[] = g.map((c, i) => (c === s[i] ? 'hit' : 'miss'));
  const left = new Map<string, number>();
  s.forEach((c, i) => {
    if (marks[i] !== 'hit') left.set(c, (left.get(c) ?? 0) + 1);
  });
  g.forEach((c, i) => {
    if (marks[i] === 'hit') return;
    const n = left.get(c) ?? 0;
    if (n > 0) {
      marks[i] = 'near';
      left.set(c, n - 1);
    }
  });
  return marks;
}

export interface WordHuntState {
  guesses: { by: string; word: string; marks: Mark[] }[];
  /** Shown once the game is over. */
  answer?: string;
}

// --- Adam Asmaca -----------------------------------------------------------------------------

export const HANGMAN_MIN = 4;
export const HANGMAN_MAX = 12;
export const HANGMAN_LIVES = 6;

export interface HangmanState {
  setter: string;
  /** The word with unguessed letters as "_". */
  mask: string;
  guessed: string[];
  wrong: number;
  answer?: string;
}

const maskWord = (word: string, guessed: string[]) =>
  [...word].map((c) => (guessed.includes(c) ? c : '_')).join('');

// --- İsim-Şehir-Hayvan -----------------------------------------------------------------------

export const CATEGORY_KEYS = ['name', 'city', 'animal', 'plant', 'thing'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
/** Letters that start enough words in every category (no ğ, ı, j, ö, ü). */
export const CATEGORY_LETTERS = [...'abcçdefghiklmnoprsştuvyz'];
export const CATEGORY_POINTS = { unique: 10, same: 5, none: 0 } as const;

export type CategoryAnswers = Partial<Record<CategoryKey, string>>;

export interface CategoriesState {
  letter: string;
  /** Who has handed in; the answers stay secret until both have. */
  submitted: string[];
  answers?: Record<string, CategoryAnswers>;
  scores?: Record<string, Record<CategoryKey, number>>;
  totals?: Record<string, number>;
}

/** Scores both players once both have handed in: 10 for a valid unique answer, 5 when both wrote the same. */
export function scoreCategories(
  letter: string,
  a: { id: string; answers: CategoryAnswers },
  b: { id: string; answers: CategoryAnswers },
): Pick<CategoriesState, 'scores' | 'totals'> {
  const valid = (x: string | undefined) => {
    const w = letters(x ?? '');
    return w.length >= 2 && w.startsWith(letter) ? w : null;
  };
  const scores = { [a.id]: {}, [b.id]: {} } as Record<string, Record<CategoryKey, number>>;
  for (const key of CATEGORY_KEYS) {
    const x = valid(a.answers[key]);
    const y = valid(b.answers[key]);
    const same = x !== null && x === y;
    scores[a.id]![key] = x ? (same ? CATEGORY_POINTS.same : CATEGORY_POINTS.unique) : 0;
    scores[b.id]![key] = y ? (same ? CATEGORY_POINTS.same : CATEGORY_POINTS.unique) : 0;
  }
  const total = (id: string) => CATEGORY_KEYS.reduce((n, k) => n + scores[id]![k], 0);
  return { scores, totals: { [a.id]: total(a.id), [b.id]: total(b.id) } };
}

// --- Moves -----------------------------------------------------------------------------------

export const gameActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    tableId: z.uuid(),
    kind: z.enum(GAME_KINDS),
    /** Adam Asmaca: the word the other player will guess. */
    word: z.string().max(40).optional(),
  }),
  z.object({ action: z.literal('guess'), gameId: z.uuid(), word: z.string().max(20) }),
  z.object({ action: z.literal('letter'), gameId: z.uuid(), letter: z.string().max(2) }),
  z.object({
    action: z.literal('answers'),
    gameId: z.uuid(),
    answers: z.partialRecord(z.enum(CATEGORY_KEYS), z.string().max(30)),
  }),
  z.object({ action: z.literal('abandon'), gameId: z.uuid() }),
]);
export type GameAction = z.infer<typeof gameActionSchema>;

/** A game as the server stores it; `secret` never leaves the server. */
export interface GameRecord {
  kind: GameKind;
  status: GameStatus;
  turnOf: string | null;
  state: WordHuntState | HangmanState | CategoriesState;
  secret: { word?: string; answers?: Record<string, CategoryAnswers> };
}

export type MoveError = 'not_your_turn' | 'invalid_move' | 'game_over';
export type MoveResult = { ok: true; game: GameRecord } | { ok: false; error: MoveError };

/** Starts a game. `pick` chooses randomly (injected for tests). */
export function startGame(
  kind: GameKind,
  me: string,
  other: string,
  opts: { word?: string; pick?: (xs: readonly string[]) => string } = {},
): { ok: true; game: GameRecord } | { ok: false; error: 'invalid_word' } {
  const pick = opts.pick ?? ((xs: readonly string[]) => xs[Math.floor(Math.random() * xs.length)]!);
  if (kind === 'word_hunt') {
    return {
      ok: true,
      game: {
        kind,
        status: 'active',
        turnOf: me,
        state: { guesses: [] },
        secret: { word: pick(WORD_HUNT_WORDS) },
      },
    };
  }
  if (kind === 'hangman') {
    const word = letters(opts.word ?? '');
    const n = [...word].length;
    if (n < HANGMAN_MIN || n > HANGMAN_MAX) {
      return { ok: false, error: 'invalid_word' };
    }
    return {
      ok: true,
      game: {
        kind,
        status: 'active',
        turnOf: other,
        state: { setter: me, mask: maskWord(word, []), guessed: [], wrong: 0 },
        secret: { word },
      },
    };
  }
  return {
    ok: true,
    game: {
      kind,
      status: 'active',
      turnOf: null,
      state: { letter: pick(CATEGORY_LETTERS), submitted: [] },
      secret: { answers: {} },
    },
  };
}

/** Applies one move by `me` (the other player is `other`). Pure: the input is not changed. */
export function applyMove(
  game: GameRecord,
  me: string,
  other: string,
  move: Exclude<GameAction, { action: 'start' }>,
): MoveResult {
  if (game.status !== 'active') return { ok: false, error: 'game_over' };
  if (move.action === 'abandon') {
    return { ok: true, game: { ...game, status: 'abandoned', turnOf: null, state: reveal(game) } };
  }

  if (game.kind === 'word_hunt' && move.action === 'guess') {
    if (game.turnOf !== me) return { ok: false, error: 'not_your_turn' };
    const word = letters(move.word);
    if ([...word].length !== WORD_LENGTH) return { ok: false, error: 'invalid_move' };
    const s = game.state as WordHuntState;
    const marks = markGuess(word, game.secret.word!);
    const guesses = [...s.guesses, { by: me, word, marks }];
    const won = marks.every((x) => x === 'hit');
    const over = won || guesses.length >= WORD_HUNT_TRIES;
    return {
      ok: true,
      game: {
        ...game,
        status: won ? 'won' : over ? 'lost' : 'active',
        turnOf: over ? null : other,
        state: { guesses, ...(over ? { answer: game.secret.word } : {}) },
      },
    };
  }

  if (game.kind === 'hangman' && move.action === 'letter') {
    if (game.turnOf !== me) return { ok: false, error: 'not_your_turn' };
    const letter = letters(move.letter);
    const s = game.state as HangmanState;
    if ([...letter].length !== 1 || s.guessed.includes(letter)) {
      return { ok: false, error: 'invalid_move' };
    }
    const word = game.secret.word!;
    const guessed = [...s.guessed, letter];
    const wrong = s.wrong + (word.includes(letter) ? 0 : 1);
    const mask = maskWord(word, guessed);
    const won = !mask.includes('_');
    const lost = wrong >= HANGMAN_LIVES;
    return {
      ok: true,
      game: {
        ...game,
        status: won ? 'won' : lost ? 'lost' : 'active',
        turnOf: won || lost ? null : me,
        state: { ...s, guessed, wrong, mask, ...(won || lost ? { answer: word } : {}) },
      },
    };
  }

  if (game.kind === 'categories' && move.action === 'answers') {
    const s = game.state as CategoriesState;
    if (s.submitted.includes(me)) return { ok: false, error: 'invalid_move' };
    const answers: CategoryAnswers = {};
    for (const key of CATEGORY_KEYS) {
      const v = move.answers[key]?.trim();
      if (v) answers[key] = v;
    }
    const secretAnswers = { ...(game.secret.answers ?? {}), [me]: answers };
    const submitted = [...s.submitted, me];
    if (submitted.length < 2) {
      return {
        ok: true,
        game: { ...game, state: { ...s, submitted }, secret: { answers: secretAnswers } },
      };
    }
    const scored = scoreCategories(
      s.letter,
      { id: me, answers },
      { id: other, answers: secretAnswers[other] ?? {} },
    );
    return {
      ok: true,
      game: {
        ...game,
        status: 'finished',
        turnOf: null,
        state: { ...s, submitted, answers: secretAnswers, ...scored },
        secret: { answers: secretAnswers },
      },
    };
  }

  return { ok: false, error: 'invalid_move' };
}

/** What everybody may see once a game is abandoned. */
function reveal(game: GameRecord): GameRecord['state'] {
  if (game.kind === 'categories') return game.state;
  return { ...game.state, answer: game.secret.word } as GameRecord['state'];
}
