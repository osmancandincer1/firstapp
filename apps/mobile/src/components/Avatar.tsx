import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { FlameGradient } from './Flame';

/**
 * A person's photo, or their initial on the flame gradient when there is
 * none. `shape` "portrait" is the tall thumbnail used in lists. Decorative:
 * the row around it names the person.
 */
export function Avatar({
  uri,
  name,
  size = 48,
  shape = 'round',
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  shape?: 'round' | 'portrait';
}) {
  const box =
    shape === 'portrait'
      ? { width: size, height: Math.round(size * 1.22), borderRadius: size * 0.32 }
      : { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      style={[styles.box, box]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <>
          <FlameGradient style={StyleSheet.absoluteFill} />
          <AppText variant="heading">{(name ?? '').slice(0, 1).toLocaleUpperCase('tr')}</AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C120D',
  },
});
