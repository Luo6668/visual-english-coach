import { useLocalSearchParams } from 'expo-router';
import { AiCoachConversation } from '@/components/ai-coach-conversation';

export default function AiCoachScreen() {
  const params = useLocalSearchParams<{ prompt?: string | string[] }>();
  const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
  return <AiCoachConversation prompt={prompt} />;
}
