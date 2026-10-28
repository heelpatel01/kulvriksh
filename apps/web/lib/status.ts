// Display labels and badge tones for the working state sets in docs/01-PRODUCT-FLOWS.md.
// The state names follow the flows (§5.1, §9.1, F-NOT-01); several are still TBC there.
import type { Tone } from '@/components/ui/primitives';

type StatusMap = Record<string, { label: string; tone: Tone }>;

export const ORDER_STATUS: StatusMap = {
  created: { label: 'Created', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const GRANT_STATUS: StatusMap = {
  pending: { label: 'Grant pending', tone: 'warning' },
  granted: { label: 'Granted', tone: 'success' },
  failed: { label: 'Grant failed', tone: 'danger' },
};

export const REPORT_STATUS: StatusMap = {
  not_started: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'warning' },
  returned: { label: 'Returned', tone: 'danger' },
  released: { label: 'Released', tone: 'success' },
};

/** Working case status for the genealogist queue (provisional; R31/R32). */
export const CASE_STATUS: StatusMap = {
  new: { label: 'New assignment', tone: 'accent' },
  in_research: { label: 'In research', tone: 'info' },
  report_draft: { label: 'Report in draft', tone: 'info' },
  submitted: { label: 'Awaiting review', tone: 'warning' },
  returned: { label: 'Returned for changes', tone: 'danger' },
  released: { label: 'Report released', tone: 'success' },
};

export const ACCOUNT_STATUS: StatusMap = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invited', tone: 'info' },
  inactive: { label: 'Deactivated', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'danger' },
};

export const NOTIFICATION_STATUS: StatusMap = {
  queued: { label: 'Queued', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const WEBHOOK_STATUS: StatusMap = {
  processed: { label: 'Processed', tone: 'success' },
  ignored: { label: 'Ignored', tone: 'neutral' },
  duplicate: { label: 'Duplicate (ignored)', tone: 'neutral' },
  needs_attention: { label: 'Needs attention', tone: 'danger' },
  received: { label: 'Received', tone: 'info' },
};

export const PAGE_STATUS: StatusMap = {
  published: { label: 'Published (preview)', tone: 'success' },
  draft: { label: 'Draft', tone: 'neutral' },
  awaiting_content: { label: 'Awaiting content', tone: 'warning' },
};

export function statusOf(map: StatusMap, key: string) {
  return map[key] ?? { label: key, tone: 'neutral' as Tone };
}
