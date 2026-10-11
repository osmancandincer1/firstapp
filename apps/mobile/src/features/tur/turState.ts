import { countdown, nextTurOpening, TUR_SIZE } from '@nokuzo/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { Reason, Tur, TurCard } from './api';

/** Decisions that close a card for this Round; 'none' keeps it open. */
const DECIDED = new Set(['answered', 'passed', 'saved']);
export const isDecided = (card: TurCard) => DECIDED.has(card.action);

export type TurView =
  | { kind: 'waiting'; opensAt: Date }
  | { kind: 'empty'; tur: Tur }
  | { kind: 'cards'; tur: Tur; small: boolean }
  | { kind: 'finished'; tur: Tur; nextAt: Date };

/**
 * What the Round tab shows (§8.1 #18): not open yet (countdown), cards, an
 * honest empty pool, or "Tur bitti" once every card has a decision.
 */
export function turView(tur: Tur | null, now: Date): TurView {
  if (!tur) return { kind: 'waiting', opensAt: nextTurOpening(now) };
  const opensAt = new Date(tur.opensAt);
  if (opensAt.getTime() > now.getTime()) return { kind: 'waiting', opensAt };
  if (tur.cards.length === 0) return { kind: 'empty', tur };
  if (tur.cards.every(isDecided)) return { kind: 'finished', tur, nextAt: nextTurOpening(now) };
  return { kind: 'cards', tur, small: tur.cards.length < TUR_SIZE };
}

/** First card without a decision, so reopening the tab continues where the user left. */
export function firstOpenIndex(cards: TurCard[]): number {
  const i = cards.findIndex((c) => !isDecided(c));
  return i === -1 ? 0 : i;
}

export function useCountdownText() {
  const { t } = useTranslation();
  return useCallback((now: Date, target: Date) => t('tur.countdown', countdown(now, target)), [t]);
}

/** Localized "Neden bu kişi?" lines (§4.6): the server sends keys, the app words them. */
export function useReasonText() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const valueText = useCallback(
    (key: string, value: string | undefined) => {
      if (!value) return '';
      if (key === 'same_intent' || key === 'neighbour_intent')
        return t(`profile.intent.intents.${value}`);
      if (key === 'same_tempo' || key === 'tempo') return t(`profile.intent.tempos.${value}`);
      if (key === 'same_first_date') return t(`profile.details.options.first_date.${value}`);
      return t(`profile.details.options.${key}.${value}`);
    },
    [t],
  );
  const reason = useCallback(
    (r: Reason) =>
      t(`tur.reasons.${r.key}`, {
        value: valueText(r.key, r.value),
        items: (r.items ?? []).map((x) => x[lang]).join(', '),
      }),
    [t, lang, valueText],
  );
  const difference = useCallback(
    (d: { key: string; theirs: string; yours: string }) =>
      t('tur.difference', {
        field:
          d.key === 'tempo' ? t('profile.intent.tempoLabel') : t(`profile.details.fields.${d.key}`),
        theirs: valueText(d.key, d.theirs),
        yours: valueText(d.key, d.yours),
      }),
    [t, valueText],
  );
  return { reason, difference };
}
