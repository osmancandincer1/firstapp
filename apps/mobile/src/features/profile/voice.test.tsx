import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import { resetRouter } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import * as api from './api';
import { VoiceCardScreen } from './VoiceCardScreen';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('./api');
jest.mock('@/lib/media', () => ({
  readBytes: () => Promise.resolve(new Uint8Array([7])),
  prepareImage: jest.fn(),
}));

const mockRecorder = {
  prepareToRecordAsync: jest.fn(),
  record: jest.fn(),
  stop: jest.fn(),
  uri: 'file://rec.m4a',
};
const mockRecState = { isRecording: false, durationMillis: 0 };
const mockPermission = { granted: true };
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: { requestRecordingPermissionsAsync: () => Promise.resolve(mockPermission) },
  setAudioModeAsync: () => Promise.resolve(),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => mockRecState,
  useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }),
}));

const m = jest.mocked(api);
const PROMPT = '00000000-0000-4000-8000-000000000077';

beforeEach(() => {
  jest.clearAllMocks();
  resetRouter();
  mockPermission.granted = true;
  Object.assign(mockRecState, { isRecording: false, durationMillis: 0 });
  useSession.setState({ status: 'signed_in', userId: 'u1' });
  m.fetchMyProfile.mockResolvedValue({
    id: 'p1',
    status: 'active',
    name: 'Ece',
    gender: 'woman',
    genderCustom: null,
    showGender: true,
    seeking: ['men'],
    intent: null,
    tempo: null,
    dealbreakers: [],
    cityId: 34,
    districtId: null,
    hasLocation: false,
    doorQuestion: null,
    interestIds: [],
    details: {},
    visibility: {},
    photos: [],
    voice: null,
    pendingEdits: [],
  });
  m.viewProfile.mockResolvedValue({ ok: true, data: { ok: true, preview: null, media: {} } });
  m.fetchVoicePrompts.mockResolvedValue([
    { id: PROMPT, text_tr: 'Kendini 20 saniyede anlat.', text_en: 'Introduce yourself.' },
  ]);
});

async function record(ms: number) {
  await fireEvent.press(await screen.findByRole('radio', { name: 'Kendini 20 saniyede anlat.' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Kaydı başlat' }));
  Object.assign(mockRecState, { isRecording: true, durationMillis: ms });
}

describe('VoiceCardScreen (§6.4)', () => {
  it('records, uploads to quarantine and processes', async () => {
    m.requestVoiceUpload.mockResolvedValue({
      ok: true,
      data: { ok: true, id: 'v1', bucket: 'quarantine', path: 'p1/voice/v1.m4a', token: 't' },
    });
    m.uploadToQuarantine.mockResolvedValue({ ok: true, data: true });
    m.processVoice.mockResolvedValue({ ok: true, data: { ok: true, status: 'approved' } });
    const view = await renderWithProviders(<VoiceCardScreen />);
    await record(8_000);
    await view.rerender(<VoiceCardScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Durdur' }));
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecorder.stop).toHaveBeenCalled();
    Object.assign(mockRecState, { isRecording: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(m.processVoice).toHaveBeenCalledWith('v1'));
    expect(m.requestVoiceUpload).toHaveBeenCalledWith(PROMPT);
    expect(m.uploadToQuarantine).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v1' }),
      new Uint8Array([7]),
      'audio/mp4',
    );
  });

  it('refuses recordings shorter than 5 seconds', async () => {
    const view = await renderWithProviders(<VoiceCardScreen />);
    await record(3_000);
    await view.rerender(<VoiceCardScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Durdur' }));
    expect(await screen.findByText('Kayıt en az 5 saniye olmalı.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('explains a missing microphone permission', async () => {
    mockPermission.granted = false;
    await renderWithProviders(<VoiceCardScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Kendini 20 saniyede anlat.' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydı başlat' }));
    expect(await screen.findByText('Kayıt için mikrofon izni gerekiyor.')).toBeOnTheScreen();
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });
});
