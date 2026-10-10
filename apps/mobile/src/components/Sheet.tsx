import { radius, space } from '@nokuzo/design-tokens';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { AppText } from './AppText';
import { Button } from './Button';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet. Slides up normally; with reduce-motion on it cross-fades
 * instead (§12.2). The back gesture/button and the scrim also close it.
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const { colors, reduceMotion } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      testID="sheet-modal"
    >
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          testID="sheet-scrim"
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.bgRaised, paddingBottom: space(3) + insets.bottom },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.textSecondary }]} />
          <AppText variant="heading">{title}</AppText>
          {children}
          <Button variant="secondary" label={t('common.close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space(3),
    gap: space(2),
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, opacity: 0.6 },
});
