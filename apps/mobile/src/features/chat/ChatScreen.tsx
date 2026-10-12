import { flame, fontFamily, fontSize, minTouchTarget, radius, space } from '@nokuzo/design-tokens';
import { FAREWELL_KEYS, MESSAGE_MAX, type ChatMessage, type FarewellKey } from '@nokuzo/shared';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  ChipGroup,
  FlameGradient,
  GlowBackdrop,
  Icon,
  Input,
  Sheet,
} from '@/components';
import {
  CaretLeftIcon,
  ClockIcon,
  DotsThreeIcon,
  GameControllerIcon,
  PaperPlaneTiltIcon,
  WarningCircleIcon,
} from '@/components/icons';
import { useTheme } from '@/design/theme';
import { ErrorNotice } from '@/features/onboarding/ErrorNotice';
import { useMyProfile } from '@/features/profile/queries';
import type { TableItem } from '@/features/tur/api';
import { TABLES_KEY, useInvalidate, useTables } from '@/features/tur/queries';
import type { ClientErrorCode } from '@/lib/api';
import { blockFromTable, markRead, reopenTable, sayFarewell } from './api';
import { useOutbox, type Pending } from './outbox';
import { GamePanel, GamePicker } from '@/features/games/GamePanel';
import { useAddMessage, useChat, useOutboxFlush } from './useChat';
import { VoiceBody, VoiceRecorder } from './Voice';

type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'msg'; key: string; message: ChatMessage }
  | { type: 'pending'; key: string; pending: Pending };

function useDayLabel() {
  const { t, i18n } = useTranslation();
  return (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return t('chat.today');
    if (d.toDateString() === yesterday.toDateString()) return t('chat.yesterday');
    return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });
  };
}

const clock = (iso: string, lang: string) =>
  new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

/** §8.1 #24 Sohbet: one table's chat, live, with its state and the ⋯ menu. */
export function ChatScreen({ tableId }: { tableId: string }) {
  const { t, i18n } = useTranslation();
  const { colors, reduceMotion } = useTheme();
  const router = useRouter();
  const me = useMyProfile();
  const tables = useTables();
  const table = tables.data?.find((x) => x.tableId === tableId);
  const { query, otherTyping, typing } = useChat(tableId, me.data?.id);
  const flush = useOutboxFlush(tableId);
  const pending = useOutbox((s) => s.items).filter((x) => x.tableId === tableId);
  const invalidate = useInvalidate();
  const dayLabel = useDayLabel();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<null | 'menu' | 'farewell' | 'block' | 'game'>(null);
  const name = table?.profile?.name ?? t('inbox.someone');
  const open = table?.status === 'active';
  const messages = query.data;

  // Reading clears the unread count; repeated whenever something new arrives.
  const lastIncoming = messages?.filter((m) => m.senderId !== me.data?.id).at(-1)?.id;
  useEffect(() => {
    if (!lastIncoming) return;
    void markRead(tableId).then(() => invalidate(TABLES_KEY));
  }, [lastIncoming, tableId, invalidate]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let day = '';
    const items: (Row & { at: string })[] = [
      ...(messages ?? []).map((m) => ({
        type: 'msg' as const,
        key: `m-${m.id}`,
        message: m,
        at: m.createdAt,
      })),
      // A pending message that already reached the server shows once, as sent.
      ...pending
        .filter((p) => !messages?.some((m) => m.clientId === p.clientId))
        .map((p) => ({
          type: 'pending' as const,
          key: `p-${p.clientId}`,
          pending: p,
          at: p.createdAt,
        })),
    ];
    for (const item of items) {
      const d = new Date(item.at).toDateString();
      if (d !== day) {
        day = d;
        out.push({ type: 'day', key: `day-${d}`, label: dayLabel(item.at) });
      }
      out.push(item);
    }
    return out.reverse();
  }, [messages, pending, dayLabel]);

  const send = () => {
    const body = text.trim();
    if (!body || !open) return;
    useOutbox.getState().add({
      clientId: randomUUID(),
      tableId,
      text: body,
      createdAt: new Date().toISOString(),
    });
    setText('');
    void flush();
  };

  const subtitle = !table
    ? ''
    : table.otherPausedUntil
      ? t('chat.paused', {
          name,
          date: new Date(table.otherPausedUntil).toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
        })
      : open
        ? table.myTurn
          ? t('chat.yourTurn')
          : t('chat.theirTurn')
        : '';

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bgBase }]} testID="chat">
      <GlowBackdrop placement="top-right" />
      <View style={[styles.header, { borderColor: flame.glassBorder }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.back')}
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Icon icon={CaretLeftIcon} size={22} color={colors.textPrimary} />
        </Pressable>
        <Avatar uri={table?.profile?.photos?.[0]?.url} name={table?.profile?.name} size={40} />
        <View style={styles.flex}>
          <AppText variant="label" numberOfLines={1}>
            {name}
          </AppText>
          {otherTyping ? (
            <AppText variant="caption" tone="accent" testID="typing">
              {t('chat.typing', { name })}
            </AppText>
          ) : subtitle ? (
            <AppText
              variant="caption"
              tone={open && table?.myTurn ? 'accent' : 'secondary'}
              numberOfLines={1}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('games.table.open')}
            onPress={() => setMenu('game')}
            style={styles.iconButton}
          >
            <Icon icon={GameControllerIcon} size={22} color={colors.accentPrimary} />
          </Pressable>
        ) : null}
        {table && ['active', 'waiting_slot', 'cooled'].includes(table.status) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.menu')}
            onPress={() => setMenu('menu')}
            style={styles.iconButton}
          >
            <Icon icon={DotsThreeIcon} size={24} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {query.isError && !messages ? (
          <View style={styles.pad}>
            <Banner tone="danger" message={t('chat.loadError')} />
          </View>
        ) : null}
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            messages && rows.length === 0 ? (
              <AppText tone="secondary" style={styles.center}>
                {t('tables.noMessages')}
              </AppText>
            ) : null
          }
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <AppText variant="caption" tone="secondary" style={styles.day}>
                {item.label}
              </AppText>
            ) : item.type === 'msg' && item.message.kind === 'system' ? (
              <SystemLine body={item.message.body} />
            ) : item.type === 'msg' ? (
              <Bubble
                message={item.message}
                mine={item.message.senderId === me.data?.id}
                time={clock(item.message.createdAt, i18n.language)}
                animate={!reduceMotion}
              />
            ) : (
              <PendingBubble pending={item.pending} onRetry={() => void flush()} />
            )
          }
        />
        {table && !open ? <TableState table={table} name={name} /> : null}
        {open ? <GamePanel tableId={tableId} me={me.data?.id} otherName={name} /> : null}
        {open ? (
          <Composer
            tableId={tableId}
            value={text}
            onChange={(v) => {
              setText(v);
              typing();
            }}
            onSend={send}
          />
        ) : null}
      </KeyboardAvoidingView>

      <Sheet visible={menu === 'menu'} title={t('chat.menu')} onClose={() => setMenu(null)}>
        <Button
          variant="secondary"
          label={t('chat.menuFarewell')}
          onPress={() => setMenu('farewell')}
        />
        <Button variant="danger" label={t('chat.menuBlock')} onPress={() => setMenu('block')} />
      </Sheet>
      <GamePicker tableId={tableId} visible={menu === 'game'} onClose={() => setMenu(null)} />
      <FarewellSheet
        visible={menu === 'farewell'}
        tableId={tableId}
        name={name}
        onClose={() => setMenu(null)}
      />
      <BlockSheet
        visible={menu === 'block'}
        tableId={tableId}
        name={name}
        onClose={() => setMenu(null)}
      />
    </SafeAreaView>
  );
}

/** A line from the table itself, e.g. "Kelime Avı başladı". */
function SystemLine({ body }: { body: string | null }) {
  const { t } = useTranslation();
  const [event, kind] = (body ?? '').split(':');
  if (!event?.startsWith('game_') || !kind) return null;
  return (
    <AppText variant="caption" tone="accent" style={styles.day}>
      {t(`games.table.system.${event}`, { game: t(`games.table.kinds.${kind}.title`) })}
    </AppText>
  );
}

function Bubble({
  message,
  mine,
  time,
  animate,
}: {
  message: ChatMessage;
  mine: boolean;
  time: string;
  animate: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Animated.View
      entering={animate ? (mine ? FadeInUp.springify().damping(18) : FadeInDown) : undefined}
      style={[styles.bubbleRow, mine ? styles.right : styles.left]}
    >
      {/* SOH-05: the warning is for the recipient only. */}
      {!mine && message.flags.offPlatform ? (
        <View style={styles.warning} testID="off-platform-warning">
          <Banner tone="warning" message={t('chat.offPlatform')} />
        </View>
      ) : null}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {mine ? <FlameGradient style={StyleSheet.absoluteFill} /> : null}
        {message.kind === 'voice' ? (
          <VoiceBody message={message} mine={mine} />
        ) : (
          <AppText tone={mine ? 'onAccent' : 'primary'}>{message.body}</AppText>
        )}
        <AppText
          variant="caption"
          tone={mine ? 'onAccent' : 'secondary'}
          style={[styles.time, mine && styles.timeMine]}
        >
          {time}
        </AppText>
      </View>
    </Animated.View>
  );
}

function PendingBubble({ pending, onRetry }: { pending: Pending; onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const failed = pending.state === 'failed';
  return (
    <Animated.View
      entering={FadeIn}
      style={[styles.bubbleRow, styles.right]}
      testID={failed ? 'message-failed' : 'message-pending'}
    >
      <View style={[styles.bubble, styles.mine, styles.pending]}>
        <FlameGradient style={StyleSheet.absoluteFill} />
        <AppText tone="onAccent">{pending.text}</AppText>
      </View>
      <View style={styles.pendingRow}>
        <Icon
          icon={failed ? WarningCircleIcon : ClockIcon}
          size={14}
          color={failed ? colors.danger : colors.textSecondary}
        />
        <AppText variant="caption" tone={failed ? 'danger' : 'secondary'}>
          {failed
            ? pending.error && pending.error !== 'network'
              ? t(`errors.${pending.error}`)
              : t('chat.failed')
            : t('chat.sending')}
        </AppText>
        {failed && pending.error === 'network' ? (
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={12}>
            <AppText variant="caption" tone="accent">
              {t('chat.retry')}
            </AppText>
          </Pressable>
        ) : null}
        {failed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => useOutbox.getState().remove(pending.clientId)}
            hitSlop={12}
          >
            <AppText variant="caption" tone="secondary">
              {t('chat.discard')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Composer({
  tableId,
  value,
  onChange,
  onSend,
}: {
  tableId: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const can = value.trim().length > 0;
  const add = useAddMessage(tableId);
  const invalidate = useInvalidate();
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<
    ClientErrorCode | 'voice_duration' | 'mic_denied' | null
  >(null);
  const voiceMessage =
    voiceError === 'voice_duration'
      ? t('chat.voice.tooShort')
      : voiceError === 'mic_denied'
        ? t('chat.voice.micDenied')
        : voiceError
          ? t(`errors.${voiceError}`)
          : null;
  return (
    <View>
      {voiceMessage ? (
        <View style={styles.pad}>
          <Banner tone="warning" message={voiceMessage} />
        </View>
      ) : null}
      <View style={[styles.composer, { borderColor: flame.glassBorder }]}>
        {recording ? null : (
          <TextInput
            ref={input}
            value={value}
            onChangeText={onChange}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('chat.placeholder')}
            multiline
            maxLength={MESSAGE_MAX}
            style={[styles.input, { color: colors.textPrimary }]}
          />
        )}
        {can ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            accessibilityState={{ disabled: !can }}
            disabled={!can}
            onPress={onSend}
            style={[styles.sendButton, !can && styles.disabled]}
          >
            <FlameGradient style={StyleSheet.absoluteFill} />
            <Icon icon={PaperPlaneTiltIcon} size={20} color={colors.onAccent} />
          </Pressable>
        ) : (
          <VoiceRecorder
            tableId={tableId}
            onRecording={setRecording}
            onError={setVoiceError}
            onSent={(m) => {
              add(m);
              void invalidate(TABLES_KEY);
            }}
          />
        )}
      </View>
    </View>
  );
}

/** What a table that is not open says, and the one thing that can be done about it. */
function TableState({ table, name }: { table: TableItem; name: string }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const s = table.status;

  const reopen = async () => {
    setBusy(true);
    const r = await reopenTable(table.tableId);
    setBusy(false);
    if (!r.ok) setError(r.error);
    await invalidate(TABLES_KEY);
  };

  let message: string;
  if (s === 'cooled') {
    message = table.iAskedReopen
      ? t('chat.state.cooledAsked', { name })
      : table.theyAskedReopen
        ? t('chat.state.cooledTheyAsked', { name })
        : t('chat.state.cooled');
  } else if (s === 'closed') {
    message = table.closedByMe ? t('chat.state.closedByMe') : t('chat.state.closed', { name });
  } else {
    message = t(`chat.state.${s}`);
  }

  return (
    <Animated.View entering={FadeInUp} style={styles.pad}>
      <Card testID="table-state">
        <AppText>{message}</AppText>
        {s === 'closed' && table.farewell ? (
          <View style={styles.farewell}>
            <AppText variant="heading">
              {`“${t(`chat.farewell.keys.${table.farewell.key}`)}”`}
            </AppText>
            {table.farewell.note ? <AppText tone="secondary">{table.farewell.note}</AppText> : null}
          </View>
        ) : null}
        {s === 'cooled' && !table.iAskedReopen ? (
          <Button label={t('chat.reopen')} loading={busy} onPress={() => void reopen()} />
        ) : null}
        <ErrorNotice error={error} />
      </Card>
    </Animated.View>
  );
}

function FarewellSheet({
  visible,
  tableId,
  name,
  onClose,
}: {
  visible: boolean;
  tableId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [key, setKey] = useState<FarewellKey | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ClientErrorCode; reason?: string } | null>(null);

  const submit = async () => {
    if (!key) return;
    setBusy(true);
    const r = await sayFarewell(tableId, key, note.trim() || undefined);
    setBusy(false);
    if (!r.ok) {
      setError({ code: r.error, ...(r.reason ? { reason: r.reason } : {}) });
      return;
    }
    await invalidate(TABLES_KEY);
    onClose();
  };

  return (
    <Sheet visible={visible} title={t('chat.farewell.title')} onClose={onClose}>
      <AppText tone="secondary">{t('chat.farewell.body', { name })}</AppText>
      <AppText variant="label">{t('chat.farewell.pick')}</AppText>
      <ChipGroup<FarewellKey>
        label={t('chat.farewell.pick')}
        options={FAREWELL_KEYS.map((k) => ({ value: k, label: t(`chat.farewell.keys.${k}`) }))}
        selected={key ? [key] : []}
        onToggle={setKey}
      />
      <Input
        label={t('chat.farewell.note')}
        value={note}
        onChangeText={setNote}
        maxLength={140}
        showCounter
      />
      {error?.code === 'text_blocked' && error.reason ? (
        <Banner tone="danger" message={t(`profile.textBlocked.${error.reason}`)} />
      ) : (
        <ErrorNotice error={error?.code ?? null} />
      )}
      <Button
        label={t('chat.farewell.send')}
        disabled={!key}
        loading={busy}
        onPress={() => void submit()}
      />
    </Sheet>
  );
}

function BlockSheet({
  visible,
  tableId,
  name,
  onClose,
}: {
  visible: boolean;
  tableId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);
  const block = async () => {
    setBusy(true);
    const r = await blockFromTable(tableId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    await invalidate(TABLES_KEY);
    onClose();
  };
  return (
    <Sheet visible={visible} title={t('chat.block.title', { name })} onClose={onClose}>
      <AppText tone="secondary">{t('chat.block.body')}</AppText>
      <ErrorNotice error={error} />
      <Button
        variant="danger"
        label={t('chat.block.confirm')}
        loading={busy}
        onPress={() => void block()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: space(2), paddingBottom: space(1) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.25),
    paddingHorizontal: space(1),
    paddingVertical: space(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: space(2), paddingVertical: space(2), gap: space(0.75) },
  center: { textAlign: 'center', marginVertical: space(4) },
  day: { textAlign: 'center', marginVertical: space(1) },
  bubbleRow: { maxWidth: '82%', gap: 4 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  warning: { marginBottom: space(0.5) },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: space(1.75),
    paddingVertical: space(1.25),
    overflow: 'hidden',
    gap: 2,
  },
  mine: { borderBottomRightRadius: 6 },
  theirs: {
    borderBottomLeftRadius: 6,
    backgroundColor: flame.glass,
    borderWidth: 1,
    borderColor: flame.glassBorder,
  },
  pending: { opacity: 0.7 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space(0.75) },
  time: { alignSelf: 'flex-end', fontSize: 11, opacity: 0.8 },
  timeMine: { opacity: 0.75 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space(1),
    margin: space(1.5),
    paddingLeft: space(2),
    padding: space(0.75),
    borderRadius: radius.xl,
    borderWidth: 1,
    backgroundColor: flame.glass,
  },
  input: {
    flex: 1,
    minHeight: minTouchTarget,
    maxHeight: 140,
    fontFamily: fontFamily.body,
    fontSize: fontSize.md,
    paddingVertical: space(1.25),
  },
  sendButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  farewell: { gap: space(0.5) },
});
