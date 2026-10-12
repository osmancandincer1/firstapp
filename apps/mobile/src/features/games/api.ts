import type {
  CategoriesState,
  CategoryAnswers,
  GameKind,
  GameStatus,
  HangmanState,
  WordHuntState,
} from '@nokuzo/shared';
import { callFunction } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/** A game as both players see it; the secret part never reaches the app. */
export interface TableGame {
  id: string;
  tableId: string;
  kind: GameKind;
  status: GameStatus;
  startedBy: string;
  turnOf: string | null;
  state: WordHuntState | HangmanState | CategoriesState;
  version: number;
  createdAt: string;
}

export interface GameRow {
  id: string;
  table_id: string;
  kind: GameKind;
  status: GameStatus;
  started_by: string;
  turn_of: string | null;
  state: TableGame['state'];
  version: number;
  created_at: string;
}

export const fromRow = (r: GameRow): TableGame => ({
  id: r.id,
  tableId: r.table_id,
  kind: r.kind,
  status: r.status,
  startedBy: r.started_by,
  turnOf: r.turn_of,
  state: r.state,
  version: r.version,
  createdAt: r.created_at,
});

/** The table's latest game (RLS: the two parties only). */
export async function fetchLatestGame(tableId: string): Promise<TableGame | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('table_games')
    .select('id, table_id, kind, status, started_by, turn_of, state, version, created_at')
    .eq('table_id', tableId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as GameRow | undefined;
  return row ? fromRow(row) : null;
}

type GameResponse = { ok: true; game: TableGame };
export const startTableGame = (tableId: string, kind: GameKind, word?: string) =>
  callFunction<GameResponse>('game', { action: 'start', tableId, kind, ...(word ? { word } : {}) });
export const guessWord = (gameId: string, word: string) =>
  callFunction<GameResponse>('game', { action: 'guess', gameId, word });
export const guessLetter = (gameId: string, letter: string) =>
  callFunction<GameResponse>('game', { action: 'letter', gameId, letter });
export const sendAnswers = (gameId: string, answers: CategoryAnswers) =>
  callFunction<GameResponse>('game', { action: 'answers', gameId, answers });
export const abandonGame = (gameId: string) =>
  callFunction<GameResponse>('game', { action: 'abandon', gameId });
