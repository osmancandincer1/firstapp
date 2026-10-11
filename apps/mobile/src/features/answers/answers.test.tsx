import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import * as profileApi from '@/features/profile/api';
import { TablesScreen } from '@/features/tables/TablesScreen';
import * as api from '@/features/tur/api';
import type { IncomingAnswer, OutgoingAnswer, PublicProfile, TableItem } from '@/features/tur/api';
import { router, resetRouter, searchParams } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import { AnswerDetailScreen } from './AnswerDetailScreen';
import { InboxScreen } from './InboxScreen';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('@/features/tur/api');
jest.mock('@/features/profile/api');
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }) }));

const m = jest.mocked(api);
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOUR = 3_600_000;
const person = (name: string): PublicProfile => ({ name, age: 29, city: 'Uşak' });
const question = { tr: 'En son neye kahkahayla güldün?', en: 'What made you laugh?' };

const incoming = (n: number, over: Partial<IncomingAnswer> = {}): IncomingAnswer => ({
  answerId: UUID(n),
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 10 * 24 * HOUR).toISOString(),
  text: 'Kedimin klavyede yürüyüşüne!',
  voiceMs: null,
  question,
  profile: person('Ece'),
  ...over,
});
const outgoing = (n: number, status: OutgoingAnswer['status']): OutgoingAnswer => ({
  answerId: UUID(n),
  createdAt: new Date().toISOString(),
  text: 'Serpme, kesinlikle serpme.',
  voiceMs: null,
  question,
  status,
  profile: person(`Kişi ${n}`),
});
const inbox = (inc: IncomingAnswer[], out: OutgoingAnswer[] = []) =>
  m.fetchInbox.mockResolvedValue({ ok: true, data: { ok: true, incoming: inc, outgoing: out } });

beforeEach(() => {
  jest.clearAllMocks();
  resetRouter();
  useSession.setState({ status: 'signed_in', userId: 'u1' });
  jest.mocked(profileApi).fetchCities.mockResolvedValue([]);
  inbox([]);
});

describe('InboxScreen (§8.1 #21)', () => {
  it('shows empty states for both lists', async () => {
    await renderWithProviders(<InboxScreen />);
    expect(await screen.findByTestId('inbox-empty')).toBeTruthy();
    await fireEvent.press(screen.getByText('Gönderdiklerim'));
    expect(screen.getByTestId('outbox-empty')).toBeTruthy();
  });

  it('lists incoming answers in full, with voice answers marked', async () => {
    inbox([incoming(1), incoming(2, { text: null, voiceMs: 7400, profile: person('Mert') })]);
    await renderWithProviders(<InboxScreen />);
    expect(await screen.findByText('Gelenler (2)')).toBeTruthy();
    expect(screen.getByText('Ece, 29')).toBeTruthy();
    expect(screen.getByText('“Kedimin klavyede yürüyüşüne!”')).toBeTruthy();
    expect(screen.getByText('Sesli cevap · 7 sn')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Cevabı ve profili gör')[0]!);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/inbox/[id]', params: { id: UUID(1) } });
  });

  it('shows sent answers with waiting / replied / dropped — never "passed" (§4.2)', async () => {
    inbox([], [outgoing(3, 'waiting'), outgoing(4, 'reciprocated'), outgoing(5, 'dropped')]);
    await renderWithProviders(<InboxScreen />);
    await fireEvent.press(await screen.findByText('Gönderdiklerim'));
    expect(screen.getByText('Bekliyor')).toBeTruthy();
    expect(screen.getByText('Karşılık geldi')).toBeTruthy();
    expect(screen.getByText('Düştü')).toBeTruthy();
    expect(screen.queryByText(/geçti/i)).toBeNull();
  });

  it('shows offline with retry when nothing is cached', async () => {
    m.fetchInbox.mockResolvedValue({ ok: false, error: 'network' });
    await renderWithProviders(<InboxScreen />);
    expect(await screen.findByTestId('inbox-error')).toBeTruthy();
    inbox([incoming(1)]);
    await fireEvent.press(screen.getByText('Tekrar dene'));
    expect(await screen.findByText('Ece, 29')).toBeTruthy();
  });
});

describe('AnswerDetailScreen (§8.1 #22)', () => {
  beforeEach(() => {
    searchParams.current = { id: UUID(1) };
    inbox([incoming(1)]);
  });

  it('shows the answer with the full profile, and reciprocating opens a table', async () => {
    m.reciprocate.mockResolvedValue({
      ok: true,
      data: { ok: true, tableId: UUID(8), tableStatus: 'active' },
    });
    await renderWithProviders(<AnswerDetailScreen />);
    expect(await screen.findByText('“Kedimin klavyede yürüyüşüne!”')).toBeTruthy();
    expect(screen.getByText('En son neye kahkahayla güldün?')).toBeTruthy();
    expect(screen.getByText('Karşılık ver')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('reciprocate-message'), '  Benim kedim de!  ');
    await fireEvent.press(screen.getByText('Karşılık ver'));
    expect(await screen.findByText('Masa açıldı')).toBeTruthy();
    expect(m.reciprocate).toHaveBeenCalledWith(UUID(1), 'Benim kedim de!');
    await fireEvent.press(screen.getByText('Masalara git'));
    expect(router.replace).toHaveBeenCalledWith('/tables');
  });

  it('explains "Masa bekliyor" when slots are full (MAS-04)', async () => {
    m.reciprocate.mockResolvedValue({
      ok: true,
      data: { ok: true, tableId: UUID(8), tableStatus: 'waiting_slot' },
    });
    await renderWithProviders(<AnswerDetailScreen />);
    await fireEvent.changeText(await screen.findByTestId('reciprocate-message'), 'Selam');
    await fireEvent.press(screen.getByText('Karşılık ver'));
    expect(await screen.findByText(/72 saat içinde yer açılırsa/)).toBeTruthy();
  });

  it('refuses contact details in the reply', async () => {
    m.reciprocate.mockResolvedValue({ ok: false, error: 'text_blocked', reason: 'contact_info' });
    await renderWithProviders(<AnswerDetailScreen />);
    await fireEvent.changeText(
      await screen.findByTestId('reciprocate-message'),
      'wp 0532 123 45 67',
    );
    await fireEvent.press(screen.getByText('Karşılık ver'));
    expect(await screen.findByText(/İletişim bilgisi/)).toBeTruthy();
  });

  it('passes silently and goes back', async () => {
    m.passAnswer.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderWithProviders(<AnswerDetailScreen />);
    await fireEvent.press(await screen.findByText('Geç'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(m.passAnswer).toHaveBeenCalledWith(UUID(1));
  });

  it('says so when the answer is gone', async () => {
    searchParams.current = { id: UUID(404) };
    await renderWithProviders(<AnswerDetailScreen />);
    expect(await screen.findByText('Bu cevap artık yok.')).toBeTruthy();
  });
});

describe('TablesScreen (§8.1 #23)', () => {
  const table = (n: number, over: Partial<TableItem> = {}): TableItem => ({
    tableId: UUID(n),
    status: 'active',
    waitingExpiresAt: null,
    lastMessageAt: new Date().toISOString(),
    myTurn: false,
    profile: person(`Masa ${n}`),
    ...over,
  });

  it('shows the empty state and free slots', async () => {
    m.listTables.mockResolvedValue({ ok: true, data: { ok: true, tables: [] } });
    await renderWithProviders(<TablesScreen />);
    expect(await screen.findByTestId('tables-empty')).toBeTruthy();
    expect(screen.getByLabelText('0 / 3 masa dolu')).toBeTruthy();
  });

  it('shows active tables with "Sıra sende" and the waiting queue with time left', async () => {
    m.listTables.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        tables: [
          table(1, { myTurn: true }),
          table(2),
          table(3),
          table(4, {
            status: 'waiting_slot',
            waitingExpiresAt: new Date(Date.now() + 5 * HOUR + 120_000).toISOString(),
          }),
        ],
      },
    });
    await renderWithProviders(<TablesScreen />);
    expect(await screen.findByLabelText('3 / 3 masa dolu')).toBeTruthy();
    expect(screen.getAllByText('Sıra sende')).toHaveLength(1);
    expect(screen.getByText('Masa bekliyor')).toBeTruthy();
    expect(screen.getByText(/Yer açılması için 5 sa \d+ dk/)).toBeTruthy();
  });

  it('shows an error with retry', async () => {
    m.listTables.mockResolvedValue({ ok: false, error: 'internal' });
    await renderWithProviders(<TablesScreen />);
    expect(await screen.findByText('Masalar yüklenemedi.')).toBeTruthy();
  });
});
