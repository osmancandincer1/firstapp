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
export const CardsIcon: Icon = require('phosphor-react-native/src/icons/Cards').CardsIcon;
export const ChatsCircleIcon: Icon =
  require('phosphor-react-native/src/icons/ChatsCircle').ChatsCircleIcon;
export const CoffeeIcon: Icon = require('phosphor-react-native/src/icons/Coffee').CoffeeIcon;
export const UserIcon: Icon = require('phosphor-react-native/src/icons/User').UserIcon;
export const PlayIcon: Icon = require('phosphor-react-native/src/icons/Play').PlayIcon;
export const ArrowLeftIcon: Icon =
  require('phosphor-react-native/src/icons/ArrowLeft').ArrowLeftIcon;
export const ArrowRightIcon: Icon =
  require('phosphor-react-native/src/icons/ArrowRight').ArrowRightIcon;
export const FireIcon: Icon = require('phosphor-react-native/src/icons/Fire').FireIcon;
export const ChatCircleIcon: Icon =
  require('phosphor-react-native/src/icons/ChatCircle').ChatCircleIcon;
export const XIcon: Icon = require('phosphor-react-native/src/icons/X').XIcon;
export const BookmarkSimpleIcon: Icon =
  require('phosphor-react-native/src/icons/BookmarkSimple').BookmarkSimpleIcon;
export const SparkleIcon: Icon = require('phosphor-react-native/src/icons/Sparkle').SparkleIcon;
export const SlidersHorizontalIcon: Icon =
  require('phosphor-react-native/src/icons/SlidersHorizontal').SlidersHorizontalIcon;
export const PaperPlaneTiltIcon: Icon =
  require('phosphor-react-native/src/icons/PaperPlaneTilt').PaperPlaneTiltIcon;
export const SealCheckIcon: Icon =
  require('phosphor-react-native/src/icons/SealCheck').SealCheckIcon;
export const CaretLeftIcon: Icon =
  require('phosphor-react-native/src/icons/CaretLeft').CaretLeftIcon;
export const MicrophoneIcon: Icon =
  require('phosphor-react-native/src/icons/Microphone').MicrophoneIcon;
export const CaretRightIcon: Icon =
  require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon;
export const DiceFiveIcon: Icon = require('phosphor-react-native/src/icons/DiceFive').DiceFiveIcon;
export const EyeIcon: Icon = require('phosphor-react-native/src/icons/Eye').EyeIcon;
export const ClockIcon: Icon = require('phosphor-react-native/src/icons/Clock').ClockIcon;
