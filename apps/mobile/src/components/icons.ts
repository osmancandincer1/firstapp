/* eslint-disable @typescript-eslint/no-require-imports */
import type { Icon } from 'phosphor-react-native';

/**
 * The only place Phosphor icons are imported (D-013).
 *
 * Importing from the package root bundles all ~1500 icons (≈9 MB on web), so
 * each icon is loaded from its own file. Those files are raw .tsx that would
 * otherwise be type-checked as our code, hence `require` with an explicit type.
 * Add new icons here.
 */
export const InfoIcon: Icon = require('phosphor-react-native/src/icons/Info').InfoIcon;
export const WarningIcon: Icon = require('phosphor-react-native/src/icons/Warning').WarningIcon;
export const WarningOctagonIcon: Icon =
  require('phosphor-react-native/src/icons/WarningOctagon').WarningOctagonIcon;
export const WarningCircleIcon: Icon =
  require('phosphor-react-native/src/icons/WarningCircle').WarningCircleIcon;
export const CheckIcon: Icon = require('phosphor-react-native/src/icons/Check').CheckIcon;
