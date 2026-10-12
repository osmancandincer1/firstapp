import { flame, radius, space } from '@nokuzo/design-tokens';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';

export interface CardProps extends ViewProps {
  children: ReactNode;
}

/** Content surface of the "Alev" look: a faint top-lit glass with a warm hairline (D-065). */
export function Card({ children, style, ...rest }: CardProps) {
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.075)', 'rgba(255,255,255,0.03)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.6, y: 1 }}
      style={[styles.card, style]}
      {...rest}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: flame.glassBorder,
    padding: space(2.25),
    gap: space(1),
  },
});
