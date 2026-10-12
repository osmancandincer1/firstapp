import type { ChatMessage } from '@nokuzo/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import * as profileApi from '@/features/profile/api';
import { TablesScreen } from '@/features/tables/TablesScreen';
import * as turApi from '@/features/tur/api';
import type { TableItem } from '@/features/tur/api';
import { router, resetRouter } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import * as api from './api';
import { ChatScreen } from './ChatScreen';
import { flushTable, useOutbox } from './outbox';
import { mergeMessages } from './useChat';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('./api');
jest.mock('@/features/tur/api');
jest.mock('@/features/profile/api');
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));

const m = jest.mocked(api);
const tur = jest.mocked(turApi);
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = UUID(900);
const THEM = UUID(901);
const TABLE = UUID(500);

const msg = (
  n: number,
  from: string,
  body: string,
  over: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: UUID(n),
  tableId: TABLE,
  senderId: from,
  kind: 'text',
  body,
  replyTo: null,
  flags: {},
  clientId: null,
  createdAt: new Date(Date.UTC(2026, 9, 12, 10, n)).toISOString(),
  ...over,
});
const table = (over: Partial<TableItem> = {}): TableItem => ({
  tableId: TABLE,
  status: 'active',
  waitingExpiresAt: null,
  lastMessageAt: new Date().toISOString(),
  myTurn: true,
  profile: { name: 'Ece', age: 29 },
  ...over,
});
const tablesWith = (...tables: TableItem[]) =>
  tur.listTables.mockResolvedValue({
    ok: true,
    data: { ok: true, tables, pause: { until: null, usedThisMonth: 0, perMonth: 2 } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetRouter();
  useOutbox.setState({ items: [] });
  useSession.setState({ status: 'signed_in', userId: 'u1' });
  jest.mocked(profileApi).fetchMyProfile.mockResolvedValue({ id: ME, name: 'Deniz' } as never);
  m.fetchMessages.mockResolvedValue([]);
  m.markRead.mockResolvedValue({ ok: true, data: { ok: true } });
  m.sendMessage.mockImplementation((tableId, clientId, text) =>
    Promise.resolve({
      ok: true,
      data: {
        ok: true,
        message: msg(99, ME, text, { clientId, createdAt: new Date().toISOString() }),
      },
    }),
  );
  tablesWith(table());
});

describe('outbox (SOH-01, SOH-02)', () => {
  const queue = (...texts: string[]) =>
    texts.forEach((text, i) =>
      useOutbox.getState().add({
        clientId: UUID(i + 1),
        tableId: TABLE,
        text,
        createdAt: new Date(Date.UTC(2026, 9, 12, 9, i)).toISOString(),
      }),
    );

  it('sends queued messages once each, in the order they were written', async () => {
    queue('bir', 'iki', 'üç');
    const sent: string[] = [];
    await flushTable(TABLE, (x) => sent.push(x.body ?? ''));
    expect(m.sendMessage.mock.calls.map((c) => c[2])).toEqual(['bir', 'iki', 'üç']);
    expect(sent).toEqual(['bir', 'iki', 'üç']);
    expect(useOutbox.getState().items).toEqual([]);
  });

  it('keeps everything on a network failure and resumes in order', async () => {
    queue('bir', 'iki');
    m.sendMessage.mockResolvedValueOnce({ ok: false, error: 'network' });
    await flushTable(TABLE, () => undefined);
    expect(m.sendMessage).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().items.map((x) => [x.text, x.state])).toEqual([
      ['bir', 'failed'],
      ['iki', 'sending'],
    ]);
    await flushTable(TABLE, () => undefined);
    expect(m.sendMessage.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [UUID(1), 'bir'],
      [UUID(1), 'bir'], // the same client id: the server stores it once
      [UUID(2), 'iki'],
    ]);
    expect(useOutbox.getState().items).toEqual([]);
  });

  it('keeps a refused message on screen with its reason', async () => {
    queue('www.ornek.com');
    m.sendMessage.mockResolvedValueOnce({ ok: false, error: 'link_blocked' });
    await flushTable(TABLE, () => undefined);
    await flushTable(TABLE, () => undefined);
    expect(m.sendMessage).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().items[0]).toMatchObject({ state: 'failed', error: 'link_blocked' });
  });

  it('merges live messages without duplicates', () => {
    const a = msg(1, ME, 'a');
    const b = msg(2, THEM, 'b');
    expect(mergeMessages([b], [a, b]).map((x) => x.body)).toEqual(['a', 'b']);
  });
});

describe('ChatScreen (§8.1 #24)', () => {
  it('shows the conversation, sends a message and marks theirs as read', async () => {
    m.fetchMessages.mockResolvedValue([
      msg(1, THEM, 'Selam! Pazar kahvaltısı?'),
      msg(2, ME, 'Serpme!'),
    ]);
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    expect(await screen.findByText('Selam! Pazar kahvaltısı?')).toBeTruthy();
    expect(screen.getByText('Serpme!')).toBeTruthy();
    expect(await screen.findByText('Sıra sende')).toBeTruthy();
    await waitFor(() => expect(m.markRead).toHaveBeenCalledWith(TABLE));

    const send = screen.getByRole('button', { name: 'Gönder' });
    expect(send).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Mesaj yaz'), '  Saat 10 olur mu?  ');
    await fireEvent.press(send);
    await waitFor(() =>
      expect(m.sendMessage).toHaveBeenCalledWith(
        TABLE,
        UUID(mockUuid),
        'Saat 10 olur mu?',
        undefined,
      ),
    );
    // Confirmed by the server: shown once, no longer pending.
    await waitFor(() => expect(screen.queryByTestId('message-pending')).toBeNull());
    expect(screen.getAllByText('Saat 10 olur mu?')).toHaveLength(1);
  });

  it('warns the recipient, not the sender, about early off-platform nudges (SOH-05)', async () => {
    m.fetchMessages.mockResolvedValue([
      msg(1, THEM, 'WhatsApp’tan yazsana', { flags: { offPlatform: true } }),
      msg(2, ME, 'Telegram?', { flags: { offPlatform: true } }),
    ]);
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    await screen.findByText('Telegram?');
    expect(screen.getAllByTestId('off-platform-warning')).toHaveLength(1);
  });

  it('shows a failed send with retry', async () => {
    m.sendMessage.mockResolvedValue({ ok: false, error: 'network' });
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    await fireEvent.changeText(await screen.findByLabelText('Mesaj yaz'), 'Merhaba');
    await fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByTestId('message-failed')).toBeTruthy();
    expect(screen.getByText('Tekrar dene')).toBeTruthy();
  });

  it('says goodbye with a ready sentence (MAS-07)', async () => {
    m.sayFarewell.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Masa seçenekleri' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Nazik Veda' }));
    const bye = screen.getByRole('button', { name: 'Vedalaş' });
    expect(bye).toBeDisabled();
    await fireEvent.press(
      screen.getByRole('radio', { name: 'Burada bırakmak istiyorum. Kendine iyi bak.' }),
    );
    await fireEvent.press(bye);
    expect(m.sayFarewell).toHaveBeenCalledWith(TABLE, 'take_care', undefined);
  });

  it('blocks from the menu (MAS-08)', async () => {
    m.blockFromTable.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Masa seçenekleri' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Engelle' }));
    expect(screen.getByText('Ece engellensin mi?')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Engelle' }).at(-1)!);
    expect(m.blockFromTable).toHaveBeenCalledWith(TABLE);
  });

  it('shows the goodbye it received, read-only', async () => {
    tablesWith(
      table({ status: 'closed', farewell: { key: 'met_someone', note: 'Sana iyi şanslar' } }),
    );
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    expect(await screen.findByText('Ece vedalaştı.')).toBeTruthy();
    expect(
      screen.getByText('“Başka biriyle tanışmaya başladım; dürüst olmak istedim.”'),
    ).toBeTruthy();
    expect(screen.getByText('Sana iyi şanslar')).toBeTruthy();
    expect(screen.queryByLabelText('Mesaj yaz')).toBeNull();
  });

  it('offers to reopen a cooled table', async () => {
    tablesWith(table({ status: 'cooled', theyAskedReopen: true }));
    m.reopenTable.mockResolvedValue({ ok: true, data: { ok: true, result: 'reopened' } });
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    expect(await screen.findByText('Ece masayı yeniden açmak istiyor.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Yeniden açmak istiyorum' }));
    expect(m.reopenTable).toHaveBeenCalledWith(TABLE);
  });

  it('tells the blocked side only that the chat ended', async () => {
    tablesWith(table({ status: 'ended', profile: null }));
    await renderWithProviders(<ChatScreen tableId={TABLE} />);
    expect(await screen.findByText('Sohbet sona erdi.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Masa seçenekleri' })).toBeNull();
  });
});

describe('TablesScreen with chat', () => {
  it('opens a chat, shows the last message, unread count and the archive', async () => {
    tablesWith(
      table({ unread: 2, lastMessage: { body: 'Ne zaman buluşalım?', kind: 'text', mine: false } }),
      table({ tableId: UUID(501), status: 'cooled', profile: { name: 'Mert' } }),
    );
    await renderWithProviders(<TablesScreen />);
    expect(await screen.findByText('Ne zaman buluşalım?')).toBeTruthy();
    expect(screen.getByText('Arşiv')).toBeTruthy();
    expect(screen.getByText('Soğudu')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ece, 2 yeni mesaj' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/table/[id]', params: { id: TABLE } });
  });

  it('starts and ends a break (Mola)', async () => {
    m.startPause.mockResolvedValue({ ok: true, data: { ok: true, until: '2026-10-15T10:00:00Z' } });
    await renderWithProviders(<TablesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Mola ver' }));
    await fireEvent.press(screen.getByRole('radio', { name: '5 gün' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Molaya başla' }));
    expect(m.startPause).toHaveBeenCalledWith(5);

    tur.listTables.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        tables: [],
        pause: { until: '2026-10-15T10:00:00Z', usedThisMonth: 1, perMonth: 2 },
      },
    });
    m.endPause.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<TablesScreen />);
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Moladan dön' })).at(-1)!);
    expect(m.endPause).toHaveBeenCalled();
  });
});
