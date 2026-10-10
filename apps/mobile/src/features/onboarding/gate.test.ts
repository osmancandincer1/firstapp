import { resolveGate, STEP_ROUTES, type ServerOnboardingState } from './gate';

const state: ServerOnboardingState = {
  status: 'onboarding',
  phoneVerified: true,
  phoneLast2: '67',
  birthDate: null,
  ageGateLockedUntil: null,
  consentsComplete: false,
  livenessVerified: false,
  idRequired: false,
};
const done = { isPending: false, isError: false, data: state };

describe('resolveGate (AUTH-06)', () => {
  it('handles configuration, session and loading states', () => {
    expect(resolveGate({ configured: false, session: 'signed_in', query: done })).toEqual({
      kind: 'not_configured',
    });
    expect(resolveGate({ configured: true, session: 'loading', query: done })).toEqual({
      kind: 'loading',
    });
    expect(resolveGate({ configured: true, session: 'signed_out', query: done })).toEqual({
      kind: 'signed_out',
    });
    expect(
      resolveGate({ configured: true, session: 'signed_in', query: { ...done, isPending: true } }),
    ).toEqual({
      kind: 'loading',
    });
  });

  it('reports errors and missing profiles', () => {
    expect(
      resolveGate({ configured: true, session: 'signed_in', query: { ...done, isError: true } }),
    ).toEqual({
      kind: 'error',
    });
    expect(
      resolveGate({ configured: true, session: 'signed_in', query: { ...done, data: null } }),
    ).toEqual({
      kind: 'error',
    });
  });

  it('resumes at the first unfinished step', () => {
    expect(resolveGate({ configured: true, session: 'signed_in', query: done })).toEqual({
      kind: 'step',
      step: 'birth_date',
    });
    expect(STEP_ROUTES.birth_date).toBe('/onboarding/birth-date');
  });

  it('sends banned accounts to the blocked screen', () => {
    expect(
      resolveGate({
        configured: true,
        session: 'signed_in',
        query: { ...done, data: { ...state, status: 'banned' } },
      }),
    ).toEqual({ kind: 'blocked' });
  });
});
