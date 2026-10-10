import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { View } from 'react-native';

export interface IconProps {
  icon: PhosphorIcon;
  color: string;
  size?: number;
}

/**
 * Decorative Phosphor icon (§12.1: one weight, no emoji as UI icons). Hidden
 * from screen readers because the adjacent text always carries the meaning.
 */
export function Icon({ icon: Glyph, color, size = 20 }: IconProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Glyph size={size} color={color} weight="regular" />
    </View>
  );
}
