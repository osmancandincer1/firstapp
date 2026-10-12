import { flame, minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import {
  CATEGORY_KEYS,
  GAME_KINDS,
  HANGMAN_LIVES,
  letters,
  TR_ALPHABET,
  WORD_HUNT_TRIES,
  WORD_LENGTH,
  type CategoriesState,
  type CategoryAnswers,
  type CategoryKey,
  type GameKind,
  type HangmanState,
  type Mark,
  type WordHuntState,
} from '@nokuzo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { AppText, Banner, Button, Card, FlameGradient, Icon, Input, Sheet } from '@/components';
import { CaretDownIcon, CaretUpIcon, FireIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import type { ApiResult, ClientErrorCode } from '@/lib/api';
import {
  abandonGame,
  guessLetter,
  guessWord,
  sendAnswers,
  startTableGame,
  type TableGame,
} from './api';
import { useTableGame } from './useTableGame';

type Failure = { error: ClientErrorCode; reason?: string } | null;

function useMove(set: (g: TableGame) => void) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const run = async (call: () => Promise<ApiResult<{ ok: true; game: TableGame }>>) => {
    if (busy) return false;
    setBusy(true);
    setFailure(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) {
      setFailure({ error: r.error, ...(r.reason ? { reason: r.reason } : {}) });
      return false;
    }
    set(r.data.game);
    return true;
  };
  return { busy, failure, run };
}

function FailureNotice({ failure }: { failure: Failure }) {
  const { t } = useTranslation();
  if (!failure) return null;
  const message =
    failure.error === 'text_blocked' && failure.reason
      ? t(`profile.textBlocked.${failure.reason}`)
      : t(`errors.${failure.error}`);
  return <Banner tone="warning" message={message} />;
}

/**
 * A game at the table (D-064): the current board pinned above the composer,
 * folding away when not needed. Both players see each move live.
 */
export function GamePanel({
  tableId,
  me,
  otherName,
}: {
  tableId: string;
  me: string | undefined;
  otherName: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const game = useTableGame(tableId);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const g = game.data;
  if (!g || !me || dismissed === g.id) return null;
  const active = g.status === 'active';
  const myTurn = g.turnOf === me || (g.kind === 'categories' && active);
  const title = t(`games.table.kinds.${g.kind}.title`);

  return (
    <Animated.View entering={FadeIn} style={styles.panelWrap}>
      <Card testID="game-panel" style={styles.panel}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={title}
          onPress={() => setOpen(!open)}
          style={styles.panelHead}
        >
          <Icon icon={FireIcon} size={18} color={colors.accentPrimary} />
          <AppText variant="label" style={styles.flex}>
            {title}
          </AppText>
          {active && g.kind !== 'categories' ? (
            <AppText variant="caption" tone={myTurn ? 'accent' : 'secondary'}>
              {myTurn ? t('games.table.yourTurn') : t('games.table.theirTurn')}
            </AppText>
          ) : null}
          <Icon icon={open ? CaretUpIcon : CaretDownIcon} size={16} color={colors.textSecondary} />
        </Pressable>
        {open ? (
          <>
            {g.kind === 'word_hunt' ? (
              <WordHunt game={g} myTurn={myTurn} set={game.set} />
            ) : g.kind === 'hangman' ? (
              <Hangman game={g} me={me} myTurn={myTurn} set={game.set} />
            ) : (
              <Categories game={g} me={me} otherName={otherName} set={game.set} />
            )}
            {active ? (
              <Button
                variant="ghost"
                label={t('games.table.abandon')}
                onPress={() => void abandonGame(g.id).then((r) => r.ok && game.set(r.data.game))}
              />
            ) : (
              <Button
                variant="ghost"
                label={t('games.table.close')}
                onPress={() => setDismissed(g.id)}
              />
            )}
          </>
        ) : null}
      </Card>
    </Animated.View>
  );
}

const MARK_STYLE: Record<Mark, object> = {
  hit: { backgroundColor: flame.mid, borderColor: 'transparent' },
  near: { backgroundColor: '#B07A2A', borderColor: 'transparent' },
  miss: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: flame.chipBorder },
};

function WordHunt({
  game,
  myTurn,
  set,
}: {
  game: TableGame;
  myTurn: boolean;
  set: (g: TableGame) => void;
}) {
  const { t } = useTranslation();
  const { reduceMotion } = useTheme();
  const s = game.state as WordHuntState;
  const [word, setWord] = useState('');
  const { busy, failure, run } = useMove(set);
  const clean = letters(word);
  const rows = Array.from({ length: WORD_HUNT_TRIES }, (_, i) => s.guesses[i]);

  return (
    <View style={styles.gap} testID="word-hunt">
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {Array.from({ length: WORD_LENGTH }, (_, c) => {
              const ch = row ? [...row.word][c] : undefined;
              const mark = row?.marks[c];
              return (
                <Animated.View
                  key={c}
                  entering={row && !reduceMotion ? ZoomIn.delay(c * 70) : undefined}
                  style={[styles.tile, mark ? MARK_STYLE[mark] : styles.emptyTile]}
                  accessible={Boolean(row)}
                  accessibilityLabel={
                    ch && mark ? `${ch}, ${t(`games.table.wordHunt.marks.${mark}`)}` : undefined
                  }
                >
                  <AppText variant="heading">{ch?.toLocaleUpperCase('tr') ?? ''}</AppText>
                </Animated.View>
              );
            })}
          </View>
        ))}
      </View>
      {game.status === 'won' ? (
        <AppText tone="accent">{t('games.table.wordHunt.won')}</AppText>
      ) : game.status !== 'active' && s.answer ? (
        <AppText tone="secondary">
          {t('games.table.wordHunt.lost', { word: s.answer.toLocaleUpperCase('tr') })}
        </AppText>
      ) : myTurn ? (
        <View style={styles.inline}>
          <View style={styles.flex}>
            <Input
              label={t('games.table.wordHunt.guessLabel')}
              value={word}
              onChangeText={setWord}
              maxLength={WORD_LENGTH + 2}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <Button
            label={t('games.table.wordHunt.guess')}
            disabled={[...clean].length !== WORD_LENGTH}
            loading={busy}
            onPress={() =>
              void run(() => guessWord(game.id, clean)).then((done) => done && setWord(''))
            }
          />
        </View>
      ) : (
        <AppText variant="caption" tone="secondary">
          {t('games.table.wordHunt.left', { count: WORD_HUNT_TRIES - s.guesses.length })}
        </AppText>
      )}
      <FailureNotice failure={failure} />
    </View>
  );
}

function Hangman({
  game,
  me,
  myTurn,
  set,
}: {
  game: TableGame;
  me: string;
  myTurn: boolean;
  set: (g: TableGame) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = game.state as HangmanState;
  const { busy, failure, run } = useMove(set);
  const lives = HANGMAN_LIVES - s.wrong;
  const setter = s.setter === me;

  return (
    <View style={styles.gap} testID="hangman">
      <View
        style={styles.flames}
        accessible
        accessibilityLabel={t('games.table.hangman.lives', { count: lives })}
      >
        {Array.from({ length: HANGMAN_LIVES }, (_, i) => (
          <View key={i} style={[styles.flame, i >= lives && styles.out]}>
            <Icon
              icon={FireIcon}
              size={22}
              color={i < lives ? flame.start : colors.textSecondary}
            />
          </View>
        ))}
      </View>
      <AppText variant="title" style={styles.mask} accessibilityLabel={s.mask.replace(/_/g, '?')}>
        {[...s.mask].map((c) => (c === '_' ? '_' : c.toLocaleUpperCase('tr'))).join(' ')}
      </AppText>
      {game.status === 'won' && s.answer ? (
        <AppText tone="accent">
          {t('games.table.hangman.won', { word: s.answer.toLocaleUpperCase('tr') })}
        </AppText>
      ) : game.status !== 'active' && s.answer ? (
        <AppText tone="secondary">
          {t('games.table.hangman.lost', { word: s.answer.toLocaleUpperCase('tr') })}
        </AppText>
      ) : setter ? (
        <AppText variant="caption" tone="secondary">
          {t('games.table.hangman.lives', { count: lives })}
        </AppText>
      ) : myTurn ? (
        <View style={styles.keys}>
          {TR_ALPHABET.map((c) => {
            const used = s.guessed.includes(c);
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={t('games.table.hangman.letter', {
                  letter: c.toLocaleUpperCase('tr'),
                })}
                accessibilityState={{ disabled: used || busy }}
                disabled={used || busy}
                onPress={() => void run(() => guessLetter(game.id, c))}
                style={[styles.key, used && styles.usedKey]}
              >
                <AppText variant="label">{c.toLocaleUpperCase('tr')}</AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <FailureNotice failure={failure} />
    </View>
  );
}

function Categories({
  game,
  me,
  otherName,
  set,
}: {
  game: TableGame;
  me: string;
  otherName: string;
  set: (g: TableGame) => void;
}) {
  const { t } = useTranslation();
  const s = game.state as CategoriesState;
  const [answers, setAnswers] = useState<CategoryAnswers>({});
  const { busy, failure, run } = useMove(set);
  const mine = s.submitted.includes(me);
  const theirs = s.submitted.some((x) => x !== me);
  const other = Object.keys(s.totals ?? {}).find((x) => x !== me);

  return (
    <View style={styles.gap} testID="categories">
      <View style={styles.inline}>
        <AppText tone="secondary">{t('games.table.categories.letter')}</AppText>
        <View style={styles.letter}>
          <FlameGradient style={StyleSheet.absoluteFill} />
          <AppText variant="title" tone="onAccent">
            {s.letter.toLocaleUpperCase('tr')}
          </AppText>
        </View>
      </View>
      {s.answers && s.scores && other ? (
        <View style={styles.gap}>
          {CATEGORY_KEYS.map((k: CategoryKey) => (
            <View key={k} style={styles.resultRow}>
              <AppText variant="caption" tone="secondary" style={styles.resultKey}>
                {t(`games.table.categories.fields.${k}`)}
              </AppText>
              <AppText style={styles.flex}>
                {`${s.answers![me]?.[k] ?? '—'} · ${s.scores![me]?.[k] ?? 0}`}
              </AppText>
              <AppText style={styles.flex}>
                {`${s.answers![other]?.[k] ?? '—'} · ${s.scores![other]?.[k] ?? 0}`}
              </AppText>
            </View>
          ))}
          <View style={styles.resultRow}>
            <View style={styles.resultKey} />
            <AppText variant="label" style={styles.flex}>
              {`${t('games.table.categories.you')}: ${t('games.table.categories.total', { points: s.totals![me] })}`}
            </AppText>
            <AppText variant="label" style={styles.flex}>
              {`${otherName}: ${t('games.table.categories.total', { points: s.totals![other] })}`}
            </AppText>
          </View>
        </View>
      ) : mine ? (
        <AppText tone="secondary">{t('games.table.categories.waiting')}</AppText>
      ) : (
        <>
          {theirs ? (
            <AppText variant="caption" tone="accent">
              {t('games.table.categories.theyDone', { name: otherName })}
            </AppText>
          ) : null}
          {CATEGORY_KEYS.map((k) => (
            <Input
              key={k}
              label={t(`games.table.categories.fields.${k}`)}
              value={answers[k] ?? ''}
              onChangeText={(v) => setAnswers((a) => ({ ...a, [k]: v }))}
              maxLength={30}
            />
          ))}
          <Button
            label={t('games.table.categories.submit')}
            loading={busy}
            onPress={() => void run(() => sendAnswers(game.id, answers))}
          />
        </>
      )}
      <FailureNotice failure={failure} />
    </View>
  );
}

/** Picks a game to play at the table; Adam Asmaca asks for the word first. */
export function GamePicker({
  tableId,
  visible,
  onClose,
}: {
  tableId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const game = useTableGame(tableId);
  const [kind, setKind] = useState<GameKind | null>(null);
  const [word, setWord] = useState('');
  const { busy, failure, run } = useMove(game.set);

  const start = async () => {
    if (!kind) return;
    const done = await run(() =>
      startTableGame(tableId, kind, kind === 'hangman' ? word : undefined),
    );
    if (done) {
      setKind(null);
      setWord('');
      onClose();
    }
  };

  return (
    <Sheet visible={visible} title={t('games.table.pick')} onClose={onClose}>
      {GAME_KINDS.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="radio"
          accessibilityState={{ selected: kind === k, checked: kind === k }}
          accessibilityLabel={t(`games.table.kinds.${k}.title`)}
          onPress={() => setKind(k)}
          style={[styles.option, kind === k && styles.optionOn]}
        >
          <AppText variant="label">{t(`games.table.kinds.${k}.title`)}</AppText>
          <AppText variant="caption" tone="secondary">
            {t(`games.table.kinds.${k}.body`)}
          </AppText>
        </Pressable>
      ))}
      {kind === 'hangman' ? (
        <Input
          label={t('games.table.hangman.wordLabel')}
          help={t('games.table.hangman.wordHelp')}
          value={word}
          onChangeText={setWord}
          maxLength={20}
          autoCorrect={false}
          secureTextEntry
        />
      ) : null}
      <FailureNotice failure={failure} />
      <Button
        label={t('games.table.start')}
        disabled={!kind || (kind === 'hangman' && [...letters(word)].length < 4)}
        loading={busy}
        onPress={() => void start()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space(1.25) },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: space(1) },
  panelWrap: { paddingHorizontal: space(1.5), paddingTop: space(1) },
  panel: { gap: space(1.25), padding: space(2) },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space(1), minHeight: 32 },
  grid: { gap: 6, alignSelf: 'center' },
  gridRow: { flexDirection: 'row', gap: 6 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTile: { borderColor: flame.chipBorder },
  flames: { flexDirection: 'row', justifyContent: 'center', gap: space(1) },
  flame: {},
  out: { opacity: 0.3 },
  mask: { textAlign: 'center', letterSpacing: 4 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  key: {
    minWidth: 36,
    height: minTouchTarget - 4,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: flame.chip,
    borderWidth: 1,
    borderColor: flame.chipBorder,
  },
  usedKey: { opacity: 0.3 },
  letter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  resultKey: { width: 64 },
  option: {
    padding: space(1.75),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: flame.chipBorder,
    backgroundColor: flame.chip,
    gap: 4,
  },
  optionOn: { borderColor: flame.start },
});
