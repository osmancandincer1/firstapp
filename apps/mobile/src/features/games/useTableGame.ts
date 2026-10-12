import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';
import { fetchLatestGame, fromRow, type GameRow, type TableGame } from './api';

export const GAME_KEY = 'table-game';

/** Stores a game in the cache, never stepping back to an older version of the same game. */
export function useSetGame(tableId: string) {
  const qc = useQueryClient();
  const userId = useSession((s) => s.userId);
  return useCallback(
    (game: TableGame) =>
      qc.setQueryData<TableGame | null>([GAME_KEY, tableId, userId], (old) =>
        old && old.id === game.id && old.version > game.version ? old : game,
      ),
    [qc, tableId, userId],
  );
}

/**
 * The table's latest game, kept live: every move of either player arrives
 * through Realtime. Mount it once per table (one channel per table).
 */
export function useTableGame(tableId: string) {
  const userId = useSession((s) => s.userId);
  const set = useSetGame(tableId);
  const query = useQuery({
    queryKey: [GAME_KEY, tableId, userId],
    queryFn: () => fetchLatestGame(tableId),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!supabase || !userId) return;
    const ch = supabase
      .channel(`game:${tableId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_games', filter: `table_id=eq.${tableId}` },
        (payload) => {
          const row = payload.new as GameRow | undefined;
          if (row?.id) set(fromRow(row));
        },
      )
      .subscribe();
    return () => void supabase?.removeChannel(ch);
  }, [tableId, userId, set]);

  return { ...query, set };
}
