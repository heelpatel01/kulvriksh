import { statusOf } from '@/lib/status';
import { Badge, type Tone } from './primitives';

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const status = statusOf(map, value);
  return <Badge tone={status.tone}>{status.label}</Badge>;
}
