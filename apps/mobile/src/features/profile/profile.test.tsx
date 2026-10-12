import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type React from 'react';

import { useSession } from '@/features/auth/session';
import { router, resetRouter } from '@/test/router';
import { renderWithProviders } from '@/test/render';
import * as api from './api';
import type { MyProfile } from './api';
import { BasicsScreen } from './BasicsScreen';
import { DetailsScreen, splitFavorites } from './DetailsScreen';
import { DoorQuestionScreen } from './DoorQuestionScreen';
import { IntentScreen } from './IntentScreen';
import { InterestsScreen } from './InterestsScreen';
import { LocationScreen } from './LocationScreen';
import { moved, PhotosScreen } from './PhotosScreen';
import { PreviewScreen } from './PreviewScreen';
import { ProfileHomeScreen } from './ProfileHomeScreen';
import { TwoTruthsScreen } from './TwoTruthsScreen';

jest.mock('expo-router', () => require('@/test/router').routerMock);
jest.mock('./api');
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
const mockPick = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...a: unknown[]) => mockPick(...a),
}));
const mockPrepare = jest.fn();
const mockCrop = jest.fn();
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-file-system', () => ({}));
// Real crop geometry and shape checks; only the image work is faked.
jest.mock('@/lib/media', () => ({
  ...jest.requireActual('@/lib/media'),
  prepareImage: (...a: unknown[]) => mockPrepare(...a),
  cropImage: (...a: unknown[]) => mockCrop(...a),
  readBytes: jest.fn(),
}));
const mockLocation = {
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
};
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: () => mockLocation.requestForegroundPermissionsAsync(),
  getCurrentPositionAsync: () => mockLocation.getCurrentPositionAsync(),
}));
let mockState: Record<string, unknown> = {};
jest.mock('@/features/onboarding/gate', () => ({
  ...jest.requireActual('@/features/onboarding/gate'),
  useOnboardingState: () => ({ data: mockState }),
}));

const m = jest.mocked(api);

/** Renders and waits until the saved profile has loaded into the form. */
async function renderLoaded(ui: React.ReactElement) {
  await renderWithProviders(ui);
  await waitFor(() => expect(screen.queryByTestId('form-loading')).toBeNull());
}
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const emptyProfile: MyProfile = {
  id: 'p1',
  status: 'onboarding',
  name: null,
  gender: null,
  genderCustom: null,
  showGender: true,
  seeking: [],
  intent: null,
  tempo: null,
  dealbreakers: [],
  cityId: null,
  districtId: null,
  hasLocation: false,
  doorQuestion: null,
  interestIds: [],
  details: {},
  visibility: {},
  photos: [],
  voice: null,
  pendingEdits: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  resetRouter();
  mockState = {};
  useSession.setState({ status: 'signed_in', userId: 'u1' });
  m.fetchMyProfile.mockResolvedValue(emptyProfile);
  m.viewProfile.mockResolvedValue({ ok: true, data: { ok: true, preview: null, media: {} } });
  m.updateSection.mockResolvedValue({ ok: true, data: { ok: true } });
  m.fetchPresets.mockResolvedValue([
    {
      id: UUID(1),
      category: 'food',
      text_tr: 'Pazar kahvaltısı: serpme mi, simit-çay mı?',
      text_en: 'Sunday breakfast?',
    },
    {
      id: UUID(2),
      category: 'fun',
      text_tr: 'En son neye kahkahayla güldün?',
      text_en: 'Last laugh?',
    },
  ]);
  m.fetchInterests.mockResolvedValue(
    Array.from({ length: 12 }, (_, i) => ({
      id: UUID(100 + i),
      category: i < 6 ? 'sports' : 'music',
      label_tr: `İlgi ${i}`,
      label_en: `Interest ${i}`,
    })),
  );
  m.fetchCities.mockResolvedValue([
    { id: 6, name: 'Ankara' },
    { id: 34, name: 'İstanbul' },
    { id: 35, name: 'İzmir' },
  ]);
  m.fetchDistricts.mockResolvedValue([]);
  m.fetchMyFun.mockResolvedValue({ mood: null, twoTruths: null });
});

describe('BasicsScreen', () => {
  it('sends a valid answer and moves on (onboarding)', async () => {
    await renderLoaded(<BasicsScreen mode="onboarding" />);
    const next = screen.getByRole('button', { name: 'Devam' });
    expect(next).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Adın'), 'Ece');
    await fireEvent.press(screen.getByRole('radio', { name: 'Kadın' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Herkes' }));
    for (const name of ['Kadınlar', 'Erkekler', 'Non-binary kişiler']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
    await fireEvent.press(next);
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'basics',
      data: {
        name: 'Ece',
        gender: 'woman',
        showGender: true,
        seeking: ['women', 'men', 'nonbinary'],
      },
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('asks for a description of a self-described gender', async () => {
    await renderLoaded(<BasicsScreen mode="onboarding" />);
    await fireEvent.changeText(screen.getByLabelText('Adın'), 'Deniz');
    await fireEvent.press(screen.getByRole('radio', { name: 'Kendi tanımım' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Kadınlar' }));
    expect(screen.getByRole('button', { name: 'Devam' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Kendi tanımın'), 'Akışkan');
    expect(screen.getByRole('button', { name: 'Devam' })).toBeEnabled();
  });

  it('explains a moderation refusal and goes back in edit mode on success', async () => {
    m.fetchMyProfile.mockResolvedValue({
      ...emptyProfile,
      name: 'Ece',
      gender: 'woman',
      seeking: ['men'],
    });
    m.updateSection.mockResolvedValueOnce({
      ok: false,
      error: 'text_blocked',
      field: 'name',
      reason: 'contact_info',
    });
    await renderLoaded(<BasicsScreen mode="edit" />);
    await waitFor(() => expect(screen.getByLabelText('Adın').props.value).toBe('Ece'));
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(
      screen.getByText('İletişim bilgisi, sosyal medya adı ya da numara yazamazsın.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});

describe('IntentScreen', () => {
  it('needs intent and pace, and allows at most three must-haves', async () => {
    await renderLoaded(<IntentScreen mode="onboarding" />);
    const next = screen.getByRole('button', { name: 'Devam' });
    await fireEvent.press(screen.getByRole('radio', { name: 'Uzun ilişki' }));
    expect(next).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Önce biraz yazışalım' }));
    expect(next).toBeEnabled();
    for (const name of ['Sigara', 'Alkol', 'Çocuk', 'Spor']) {
      await fireEvent.press(screen.getAllByRole('checkbox', { name })[0]!);
    }
    expect(screen.getByText('En fazla 3 alan seçebilirsin.')).toBeOnTheScreen();
    expect(next).toBeDisabled(); // a chosen must-have needs at least one accepted value
    await fireEvent.press(screen.getAllByRole('checkbox', { name: 'İçmem' })[0]!); // smoking group
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Sosyal ortamda' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yok' }));
    await fireEvent.press(next);
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'intent',
      data: {
        intent: 'long_term',
        tempo: 'chat_first',
        dealbreakers: [
          { field: 'smoking', accepted: ['never'] },
          { field: 'alcohol', accepted: ['socially'] },
          { field: 'children', accepted: ['has_not'] },
        ],
      },
    });
  });
});

describe('DoorQuestionScreen', () => {
  it('saves a preset question', async () => {
    await renderLoaded(<DoorQuestionScreen mode="onboarding" />);
    await fireEvent.press(
      await screen.findByRole('radio', { name: 'En son neye kahkahayla güldün?' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'door_question',
      data: { presetId: UUID(2) },
    });
  });

  it('accepts a custom question of 8–90 characters and shows a review notice (PRO-08)', async () => {
    m.updateSection.mockResolvedValueOnce({ ok: true, data: { ok: true, pending: true } });
    await renderLoaded(<DoorQuestionScreen mode="onboarding" />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Kendin yaz' }));
    await fireEvent.changeText(screen.getByLabelText('Sorun'), 'Naber?');
    expect(screen.getByRole('button', { name: 'Devam' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Sorun'), 'Beni hangi konsere götürürdün?');
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'door_question',
      data: { customText: 'Beni hangi konsere götürürdün?' },
    });
    expect(await screen.findByTestId('held-for-review')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('InterestsScreen', () => {
  it('requires 5–10 interests and links the optional details', async () => {
    await renderLoaded(<InterestsScreen mode="onboarding" />);
    const next = screen.getByRole('button', { name: 'Devam' });
    for (let i = 0; i < 4; i++)
      await fireEvent.press(await screen.findByRole('checkbox', { name: `İlgi ${i}` }));
    expect(next).toBeDisabled();
    for (let i = 4; i < 12; i++)
      await fireEvent.press(screen.getByRole('checkbox', { name: `İlgi ${i}` }));
    expect(screen.getByTestId('interest-count')).toHaveTextContent('10 / 10 seçildi');
    expect(screen.getByRole('checkbox', { name: 'İlgi 11' })).not.toBeChecked();
    await fireEvent.press(next);
    expect(
      (m.updateSection.mock.calls[0]![0] as { data: { ids: string[] } }).data.ids,
    ).toHaveLength(10);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Diğer bilgileri ekle (isteğe bağlı)' }),
    );
    expect(router.push).toHaveBeenCalledWith('/profile/details');
  });
});

describe('LocationScreen (§13.6)', () => {
  it('filters cities and rounds the device location before sending it', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 41.008237, longitude: 28.978358 },
    });
    await renderLoaded(<LocationScreen mode="onboarding" />);
    await fireEvent.changeText(screen.getByLabelText('Şehir ara'), 'iz');
    expect(await screen.findByRole('radio', { name: 'İzmir' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Ankara' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Şehir ara'), '');
    await fireEvent.press(screen.getByRole('radio', { name: 'İstanbul' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yaklaşık konumumu kullan' }));
    expect(await screen.findByTestId('location-on')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'location',
      data: { cityId: 34, districtId: null, coords: { lat: 41.01, lng: 28.98 } },
    });
  });

  it('works without location permission', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await renderLoaded(<LocationScreen mode="onboarding" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Yaklaşık konumumu kullan' }));
    expect(await screen.findByText(/Konum izni verilmedi/)).toBeOnTheScreen();
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});

describe('DetailsScreen', () => {
  it('splits favourites', () => {
    expect(splitFavorites('Sezen Aksu, Barış Manço ,, Tarkan, Ajda')).toEqual([
      'Sezen Aksu',
      'Barış Manço',
      'Tarkan',
    ]);
    expect(splitFavorites(' , ')).toBeNull();
  });

  it('sends only changed fields, clears with null and carries visibility (PRO-06)', async () => {
    m.fetchMyProfile.mockResolvedValue({
      ...emptyProfile,
      details: { height: 170, occupation: 'Mimar' },
      visibility: {},
    });
    await renderLoaded(<DetailsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Meslek').props.value).toBe('Mimar'));
    await fireEvent.changeText(screen.getByLabelText('Meslek'), '');
    await fireEvent.press(screen.getAllByRole('radio', { name: 'İçmem' })[0]!);
    await fireEvent.changeText(screen.getByLabelText('Müzik'), 'Sezen Aksu, Barış Manço');
    await fireEvent.press(screen.getByTestId('visible-height'));
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'details',
      data: { occupation: null, smoking: 'never', music: ['Sezen Aksu', 'Barış Manço'] },
      visibility: { height: false },
    });
  });
});

describe('PhotosScreen', () => {
  const photo = (
    n: number,
    status: api.MyPhoto['status'],
    rejectReason: string | null = null,
  ): api.MyPhoto => ({
    id: UUID(n),
    position: n,
    status,
    rejectReason,
    faceMatched: n === 0,
    caption: null,
  });

  it('moves ids within the order', () => {
    expect(moved(['a', 'b', 'c'], 'c', -2)).toEqual(['c', 'a', 'b']);
    expect(moved(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
  });

  it('shows each photo’s status and the rejection reason (§6.4)', async () => {
    m.fetchMyProfile.mockResolvedValue({
      ...emptyProfile,
      photos: [
        photo(0, 'approved'),
        photo(1, 'review', 'possible_minor'),
        photo(2, 'rejected', 'no_face'),
      ],
    });
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    expect(await screen.findByText('Yayında')).toBeOnTheScreen();
    expect(screen.getByText('İnceleniyor')).toBeOnTheScreen();
    expect(screen.getByText('Ana fotoğrafta yüzün net görünmüyor.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Devam' })).toBeDisabled();
  });

  const asset = (uri: string, width: number, height: number) => ({ uri, width, height });
  /** The picker opens once the saved photos are known (free slots). */
  const pressPick = async () => {
    const button = screen.getByRole('button', { name: 'Fotoğraf seç' });
    await waitFor(() => expect(button).toBeEnabled());
    await fireEvent.press(button);
  };
  const uploadOk = () => {
    let n = 0;
    mockPrepare.mockResolvedValue({
      ok: true,
      bytes: new Uint8Array([1]),
      width: 1536,
      height: 2048,
    });
    m.requestPhotoUpload.mockImplementation(() => {
      n += 1;
      return Promise.resolve({
        ok: true,
        data: {
          ok: true,
          id: UUID(90 + n),
          bucket: 'quarantine',
          path: `p1/photos/${n}.jpg`,
          token: 'tok',
        },
      });
    });
    m.uploadToQuarantine.mockResolvedValue({ ok: true, data: true });
    m.processPhoto.mockResolvedValue({ ok: true, data: { ok: true, status: 'approved' } });
  };

  it('picks several photos at once, shows them side by side and uploads only after confirming', async () => {
    mockState = { photosComplete: false };
    m.fetchMyProfile.mockResolvedValue({ ...emptyProfile, photos: [photo(0, 'approved')] });
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [asset('file://a.heic', 3000, 4000), asset('file://b.jpg', 1080, 1350)],
    });
    uploadOk();
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    expect(await screen.findByText('Yayında')).toBeOnTheScreen();
    await pressPick();
    expect(mockPick).toHaveBeenCalledWith(
      expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 5 }),
    );
    expect(await screen.findByTestId('tray')).toBeOnTheScreen();
    expect(screen.getByTestId('tray-0')).toBeOnTheScreen();
    expect(screen.getByTestId('tray-1')).toBeOnTheScreen();
    // Nothing is sent before the user confirms.
    expect(m.requestPhotoUpload).not.toHaveBeenCalled();
    // Continue is hidden while photos wait in the tray.
    expect(screen.queryByRole('button', { name: 'Devam' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Onayla ve ekle (2)' }));
    await waitFor(() => expect(m.processPhoto).toHaveBeenCalledTimes(2));
    expect(mockPrepare).toHaveBeenCalledWith('file://a.heic', 3000, 4000);
    expect(m.uploadToQuarantine).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok' }),
      new Uint8Array([1]),
      'image/jpeg',
    );
    await waitFor(() => expect(screen.queryByTestId('tray')).toBeNull());
  });

  it('marks photos that must be cropped or are too small, and blocks confirming until fixed', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [asset('file://wide.jpg', 4000, 3000), asset('file://tiny.jpg', 600, 500)],
    });
    mockCrop.mockResolvedValue({ uri: 'file://wide-cropped.jpg', width: 2400, height: 3000 });
    uploadOk();
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    await pressPick();
    expect(await screen.findByText('Kırpılmalı')).toBeOnTheScreen();
    expect(screen.getByText('Çok küçük')).toBeOnTheScreen();
    expect(screen.getByTestId('tray-blocked')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Onayla ve ekle (0)' })).toBeDisabled();

    // Quick crop: keep the centre and confirm.
    await fireEvent.press(screen.getByTestId('tray-0'));
    expect(await screen.findByTestId('crop')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Kırp' }));
    await waitFor(() => expect(screen.queryByTestId('crop')).toBeNull());
    expect(mockCrop).toHaveBeenCalledWith('file://wide.jpg', {
      originX: 800,
      originY: 0,
      width: 2400,
      height: 3000,
    });
    expect(screen.queryByText('Kırpılmalı')).toBeNull();

    // The too-small one cannot be used; removing it unblocks the rest.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Çıkar' })[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Onayla ve ekle (1)' }));
    await waitFor(() =>
      expect(mockPrepare).toHaveBeenCalledWith('file://wide-cropped.jpg', 2400, 3000),
    );
  });

  it('does not ask to crop photos that already fit; cropping stays optional', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [asset('file://ok.jpg', 3000, 4000)] });
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    await pressPick();
    expect(await screen.findByTestId('tray-0')).toBeOnTheScreen();
    expect(screen.queryByText('Kırpılmalı')).toBeNull();
    expect(screen.getByRole('button', { name: 'Onayla ve ekle (1)' })).toBeEnabled();
    await fireEvent.press(screen.getByTestId('tray-0'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByTestId('crop')).toBeNull();
    expect(mockCrop).not.toHaveBeenCalled();
  });

  it('keeps photos that could not be sent in the tray with the error', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [asset('file://a.jpg', 3000, 4000)] });
    uploadOk();
    m.uploadToQuarantine.mockResolvedValue({ ok: false, error: 'network' });
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    await pressPick();
    await fireEvent.press(await screen.findByRole('button', { name: 'Onayla ve ekle (1)' }));
    expect(await screen.findByText('Gönderilemedi')).toBeOnTheScreen();
    expect(screen.getByTestId('error-notice')).toBeOnTheScreen();
    expect(m.processPhoto).not.toHaveBeenCalled();
  });

  it('limits the picker to the free slots (max 6)', async () => {
    m.fetchMyProfile.mockResolvedValue({
      ...emptyProfile,
      photos: [0, 1, 2, 3, 4, 5].map((n) => photo(n, 'approved')),
    });
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    expect(
      await screen.findByRole('button', { name: 'En fazla 6 fotoğraf ekleyebilirsin.' }),
    ).toBeDisabled();
  });

  it('reorders, deletes and continues when the step is complete', async () => {
    mockState = { photosComplete: true };
    m.fetchMyProfile.mockResolvedValue({
      ...emptyProfile,
      photos: [photo(0, 'approved'), photo(1, 'approved'), photo(2, 'approved')],
    });
    m.reorderPhotos.mockResolvedValue({ ok: true, data: { ok: true } });
    m.deletePhoto.mockResolvedValue({ ok: true, data: { ok: true } });
    await renderLoaded(<PhotosScreen mode="onboarding" />);
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Ana yap' }))[1]!);
    await waitFor(() => expect(m.reorderPhotos).toHaveBeenCalledWith([UUID(2), UUID(0), UUID(1)]));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Sil' })[0]!);
    await waitFor(() => expect(m.deletePhoto).toHaveBeenCalledWith(UUID(0)));
    await fireEvent.press(screen.getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });
});

describe('PreviewScreen (§6.4)', () => {
  it('shows exactly the public projection', async () => {
    m.viewProfile.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        media: { [UUID(1)]: 'https://signed/1' },
        preview: {
          name: 'Ece',
          age: 29,
          city: 'İstanbul',
          verified: true,
          intent: 'long_term',
          doorQuestion: { tr: 'En son neye kahkahayla güldün?', en: 'x' },
          interests: [{ tr: 'Koşu', en: 'Running' }],
          details: { smoking: 'never', height: 172, languages: ['tr', 'en'] },
          photos: [{ id: UUID(1), caption: 'Kapadokya' }],
        },
      },
    });
    await renderWithProviders(<PreviewScreen />);
    expect(await screen.findByText('Ece')).toBeOnTheScreen();
    expect(screen.getByText('29 · İstanbul')).toBeOnTheScreen();
    expect(screen.getByText('Doğrulandı')).toBeOnTheScreen();
    expect(screen.getByText('En son neye kahkahayla güldün?')).toBeOnTheScreen();
    expect(screen.getByTestId('preview-details')).toHaveTextContent(/İçmem/);
    expect(screen.getByTestId('preview-details')).toHaveTextContent(/172 cm/);
    expect(screen.getByTestId('preview-details')).toHaveTextContent(/Türkçe, İngilizce/);
    expect(screen.getByLabelText('Kapadokya')).toBeOnTheScreen();
  });

  it('has an empty state', async () => {
    await renderWithProviders(<PreviewScreen />);
    expect(await screen.findByText('Henüz görünür bir şey yok.')).toBeOnTheScreen();
  });
});

describe('ProfileHomeScreen', () => {
  it('links every section and shows pending reviews', async () => {
    m.fetchMyProfile.mockResolvedValue({
      ...emptyProfile,
      name: 'Ece',
      pendingEdits: [{ field: 'about', status: 'review', reason: 'commercial' }],
    });
    await renderWithProviders(<ProfileHomeScreen />);
    expect(await screen.findByText('1 değişiklik inceleniyor')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Kapı Sorusu' }));
    expect(router.push).toHaveBeenCalledWith('/profile/edit/door-question');
    await fireEvent.press(screen.getByRole('button', { name: 'Başkası nasıl görüyor?' }));
    expect(router.push).toHaveBeenCalledWith('/profile/preview');
  });
});

describe('mood and two truths one lie (D-066)', () => {
  it('saves a mood with one tap and clears it with a second', async () => {
    await renderWithProviders(<ProfileHomeScreen />);
    const walk = await screen.findByRole('radio', { name: 'yürüyüş' });
    m.fetchMyFun.mockResolvedValue({ mood: 'walk', twoTruths: null });
    await fireEvent.press(walk);
    expect(m.updateSection).toHaveBeenCalledWith({ section: 'mood', data: { mood: 'walk' } });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'yürüyüş' })).toBeSelected());
    await fireEvent.press(screen.getByRole('radio', { name: 'yürüyüş' }));
    expect(m.updateSection).toHaveBeenLastCalledWith({ section: 'mood', data: { mood: null } });
  });

  it('opens the game editor from the Games list', async () => {
    await renderWithProviders(<ProfileHomeScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'İki doğru, bir yalan, Henüz eklemedin' }),
    );
    expect(router.push).toHaveBeenCalledWith('/profile/edit/two-truths');
  });

  it('needs three different sentences and a lie before saving', async () => {
    await renderWithProviders(<TwoTruthsScreen />);
    await screen.findByLabelText('1. cümle');
    const save = screen.getByRole('button', { name: 'Kaydet' });
    const lines = ['Hiç deniz görmedim.', 'Üç kez Kars’a gittim.', 'Fotoğrafım dergide çıktı.'];
    for (const [i, line] of lines.entries())
      await fireEvent.changeText(screen.getByLabelText(`${i + 1}. cümle`), line);
    expect(save).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: '2. cümle yalan' }));
    expect(save).toBeEnabled();
    await fireEvent.changeText(screen.getByLabelText('3. cümle'), lines[0]!);
    expect(screen.getByText('Üç cümle birbirinden farklı olmalı.')).toBeOnTheScreen();
    expect(save).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('3. cümle'), lines[2]!);
    await fireEvent.press(save);
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'two_truths',
      data: { statements: lines, lie: 1 },
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('loads a saved game and can remove it', async () => {
    m.fetchMyFun.mockResolvedValue({
      mood: null,
      twoTruths: {
        statements: ['Bir cümle burada.', 'İki cümle burada.', 'Üç cümle burada.'],
        lie: 0,
      },
    });
    await renderWithProviders(<TwoTruthsScreen />);
    expect(await screen.findByDisplayValue('İki cümle burada.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Oyunu kaldır' }));
    expect(m.updateSection).toHaveBeenCalledWith({
      section: 'two_truths',
      data: { statements: null },
    });
  });
});
