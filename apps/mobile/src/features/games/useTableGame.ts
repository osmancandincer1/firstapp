import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';
import { fetchLatestGame, fromRow, type GameRow, type TableGame } from './api';

export const GAME_KEY = 'table-game';

/** The table's latest game, kept live: every move of either player arrives through Realtime. */
export function useTableGame(tableId: string) {
  const qc = useQueryClient();
  const userId = useSession((s) => s.userId);
  const key = [GAME_KEY, tableId, userId];
  const query = useQuery({
    queryKey: key,
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
          if (!row?.id) return;
          // Events can arrive late; never step back to an older version of the same game.
          qc.setQueryData<TableGame | null>([GAME_KEY, tableId, userId], (old) =>
            old && old.id === row.id && old.version > row.version ? old : fromRow(row),
          );
        },
      )
      .subscribe();
    return () => void supabase?.removeChannel(ch);
  }, [tableId, userId, qc]);

  /** Shows a move's result at once, without waiting for Realtime. */
  const set = (game: TableGame) =>
    qc.setQueryData<TableGame | null>(key, (old) =>
      old && old.id === game.id && old.version > game.version ? old : game,
    );
  return { ...query, set };
}
