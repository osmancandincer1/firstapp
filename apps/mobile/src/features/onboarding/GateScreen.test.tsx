import { screen } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import { renderWithProviders } from '@/test/render';
import { GateScreen } from './GateScreen';

jest.mock('expo-router', () => require('@/test/router').routerMock);
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
const fetchState = {
  mockResolvedValue: (data: unknown) => mockRpc.mockResolvedValue({ data, error: null }),
  mockRejectedValue: (e: Error) => mockRpc.mockResolvedValue({ data: null, error: e }),
};

const base = {
  status: 'onboarding',
  phoneVerified: true,
  phoneLast2: '67',
  birthDate: '1990-01-01',
  ageGateLockedUntil: null,
  consentsComplete: true,
  basicsComplete: true,
  livenessVerified: false,
  idRequired: false,
} as const;

describe('GateScreen', () => {
  it('sends signed-out users to the welcome screen', async () => {
    useSession.setState({ status: 'signed_out', userId: null });
    await renderWithProviders(<GateScreen />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/welcome');
  });

  it('shows a loading skeleton while the session is restored', async () => {
    useSession.setState({ status: 'loading', userId: null });
    await renderWithProviders(<GateScreen />);
    expect(screen.getByTestId('gate-loading')).toBeOnTheScreen();
  });

  it('resumes at the first unfinished step (AUTH-06)', async () => {
    useSession.setState({ status: 'signed_in', userId: 'u1' });
    fetchState.mockResolvedValue({ ...base });
    await renderWithProviders(<GateScreen />);
    expect(await screen.findByTestId('redirect')).toHaveTextContent('/onboarding/liveness');
  });

  it('routes banned accounts to the blocked screen', async () => {
    useSession.setState({ status: 'signed_in', userId: 'u2' });
    fetchState.mockResolvedValue({ ...base, status: 'banned' });
    await renderWithProviders(<GateScreen />);
    expect(await screen.findByTestId('redirect')).toHaveTextContent('/blocked');
  });

  it('offers a retry when the state cannot be loaded', async () => {
    useSession.setState({ status: 'signed_in', userId: 'u3' });
    fetchState.mockRejectedValue(new Error('offline'));
    await renderWithProviders(<GateScreen />);
    expect(await screen.findByTestId('gate-error')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeOnTheScreen();
  });
});
