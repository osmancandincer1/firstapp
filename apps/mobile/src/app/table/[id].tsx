import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '@/features/chat/ChatScreen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen tableId={id} />;
}
