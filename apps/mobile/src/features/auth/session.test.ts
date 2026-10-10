import { adoptSession, signOut, useSession, watchSession } from './session';

const mockAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  setSession: jest.fn(),
  signOut: jest.fn(),
};
// A getter: `supabase` is read lazily, after mockAuth is initialized.
jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return { auth: mockAuth };
  },
}));

const session = (id: string) => ({ user: { id } }) as never;

describe('session store', () => {
  it('follows Supabase Auth and stops when unsubscribed', async () => {
    let listener: ((e: string, s: unknown) => void) | undefined;
    const unsubscribe = jest.fn();
    mockAuth.getSession.mockResolvedValue({ data: { session: session('u1') } });
    mockAuth.onAuthStateChange.mockImplementation((cb) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    });

    const stop = watchSession();
    await Promise.resolve();
    expect(useSession.getState()).toMatchObject({ status: 'signed_in', userId: 'u1' });
    listener?.('SIGNED_OUT', null);
    expect(useSession.getState()).toMatchObject({ status: 'signed_out', userId: null });
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('adopts the server-issued session and signs out', async () => {
    mockAuth.setSession.mockResolvedValueOnce({ error: null });
    expect(await adoptSession({ access_token: 'a', refresh_token: 'r' })).toBe(true);
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    mockAuth.setSession.mockResolvedValueOnce({ error: new Error('bad') });
    expect(await adoptSession({ access_token: 'a', refresh_token: 'r' })).toBe(false);
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });
});
