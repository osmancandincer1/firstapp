import { radius, space } from '@nokuzo/design-tokens';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components';
import { useTheme } from '@/design/theme';
import {
  centredOffset,
  clampOffset,
  coverScale,
  cropImage,
  cropRect,
  maxZoom,
  PHOTO_ASPECT,
  type CropView,
} from '@/lib/media';

export interface CropTarget {
  uri: string;
  width: number;
  height: number;
}

const ZOOM_STEP = 0.25;

function touchDistance(e: GestureResponderEvent): number | null {
  const [a, b] = e.nativeEvent.touches;
  if (!a || !b) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Quick crop to the 4:5 profile frame: drag to move, pinch or −/+ to zoom.
 * "Kırp" without touching anything keeps the centre. Zoom stops where the
 * result would fall under the 800 px minimum.
 */
export function CropModal({
  target,
  onDone,
  onCancel,
}: {
  target: CropTarget;
  onDone: (cropped: CropTarget) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const frameWidth = Math.min(window.width - space(6), window.height * 0.55 * PHOTO_ASPECT);
  const view: CropView = useMemo(
    () => ({
      width: target.width,
      height: target.height,
      frameWidth,
      frameHeight: frameWidth / PHOTO_ASPECT,
    }),
    [target.width, target.height, frameWidth],
  );
  const zoomMax = maxZoom(view);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const start = centredOffset(view, 1);
  const offset = useRef({ ...start });
  // Created once; moved directly (no re-render per touch move).
  const [position] = useState(() => new Animated.ValueXY(start));
  const zoomRef = useRef(1);
  const gesture = useRef({
    x: 0,
    y: 0,
    from: { x: 0, y: 0 },
    pinch: null as number | null,
    pinchZoom: 1,
  });

  const place = (x: number, y: number, z = zoomRef.current) => {
    offset.current = clampOffset(view, z, x, y);
    position.setValue(offset.current);
  };

  /** Zooms around the frame centre so the subject stays in view. */
  const zoomTo = (next: number) => {
    const z = Math.min(zoomMax, Math.max(1, next));
    const prev = zoomRef.current;
    const cx = view.frameWidth / 2;
    const cy = view.frameHeight / 2;
    zoomRef.current = z;
    setZoom(z);
    place(cx - (cx - offset.current.x) * (z / prev), cy - (cy - offset.current.y) * (z / prev), z);
  };

  // Plain responder props (no PanResponder object): drag with one finger, pinch with two.
  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      gesture.current = {
        x: pageX,
        y: pageY,
        from: { ...offset.current },
        pinch: null,
        pinchZoom: zoomRef.current,
      };
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const d = touchDistance(e);
      if (d !== null) {
        if (gesture.current.pinch === null) {
          gesture.current.pinch = d;
          gesture.current.pinchZoom = zoomRef.current;
        }
        zoomTo(gesture.current.pinchZoom * (d / gesture.current.pinch));
        return;
      }
      const { pageX, pageY } = e.nativeEvent;
      place(
        gesture.current.from.x + pageX - gesture.current.x,
        gesture.current.from.y + pageY - gesture.current.y,
      );
    },
    onResponderRelease: () => {
      gesture.current.pinch = null;
    },
  };

  const confirm = async () => {
    setBusy(true);
    try {
      onDone(await cropImage(target.uri, cropRect(view, zoomRef.current, offset.current)));
    } finally {
      setBusy(false);
    }
  };

  const scale = coverScale(view) * zoom;
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bgBase }]} testID="crop">
        <View style={styles.titles}>
          <AppText variant="title">{t('profile.photos.cropTitle')}</AppText>
          <AppText tone="secondary">{t('profile.photos.cropHelp')}</AppText>
        </View>
        <View
          {...touch}
          accessible
          accessibilityLabel={t('profile.photos.cropFrame')}
          style={[
            styles.frame,
            {
              width: view.frameWidth,
              height: view.frameHeight,
              borderColor: colors.accentPrimary,
              backgroundColor: colors.bgSunken,
            },
          ]}
        >
          <Animated.View
            style={{
              width: view.width * scale,
              height: view.height * scale,
              transform: position.getTranslateTransform(),
            }}
          >
            <Image source={{ uri: target.uri }} style={StyleSheet.absoluteFill} contentFit="fill" />
          </Animated.View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              variant="secondary"
              label="−"
              accessibilityHint={t('profile.photos.zoomOut')}
              onPress={() => zoomTo(zoom - ZOOM_STEP)}
              disabled={zoom <= 1}
            />
          </View>
          <View style={styles.flex}>
            <Button
              variant="secondary"
              label={t('profile.photos.centre')}
              onPress={() => {
                zoomRef.current = 1;
                setZoom(1);
                place(centredOffset(view, 1).x, centredOffset(view, 1).y, 1);
              }}
            />
          </View>
          <View style={styles.flex}>
            <Button
              variant="secondary"
              label="+"
              accessibilityHint={t('profile.photos.zoomIn')}
              onPress={() => zoomTo(zoom + ZOOM_STEP)}
              disabled={zoom >= zoomMax}
            />
          </View>
        </View>
        <View style={styles.footer}>
          <Button
            label={t('profile.photos.cropDone')}
            onPress={() => void confirm()}
            loading={busy}
          />
          <Button variant="ghost" label={t('profile.photos.cropCancel')} onPress={onCancel} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space(3), gap: space(2) },
  titles: { gap: space(1) },
  frame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderRadius: radius.md,
  },
  row: { flexDirection: 'row', gap: space(1.5) },
  flex: { flex: 1 },
  footer: { marginTop: 'auto', gap: space(1.5) },
});
