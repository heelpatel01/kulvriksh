// Notification events (Flows §11.1). The confirmed event list, channels and wording are TBC (R36),
// providers TBC (R37). Only "report released → customer" is implemented, because TASK-10 asks for
// it; it is on by default for the in-app inbox only. Templates are code-defined (version 1) until
// the notification_template table (DM §9.2) is approved.

export type Channel = 'in_app' | 'email' | 'sms';
export const CHANNELS: readonly Channel[] = ['in_app', 'email', 'sms'];

export interface NotificationConfig {
  /** Channels used for report-released notifications. email/sms need a provider (none yet). */
  readonly reportReleasedChannels: readonly Channel[];
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = { reportReleasedChannels: ['in_app'] };

/** NOTIFY_REPORT_RELEASED=in_app (default) | none. email and sms are refused until R37 is decided. */
export function readNotificationConfig(raw: string | undefined, issues: string[]): NotificationConfig {
  const value = raw?.trim();
  if (!value) {
    return DEFAULT_NOTIFICATION_CONFIG;
  }
  if (value === 'none') {
    return { reportReleasedChannels: [] };
  }
  const channels = value.split(',').map((c) => c.trim());
  if (channels.some((c) => !(CHANNELS as readonly string[]).includes(c))) {
    issues.push('NOTIFY_REPORT_RELEASED may list only in_app, email, sms (or none)');
    return DEFAULT_NOTIFICATION_CONFIG;
  }
  if (channels.some((c) => c !== 'in_app')) {
    issues.push('NOTIFY_REPORT_RELEASED: email and sms need a delivery provider, and none is configured (R37)');
    return DEFAULT_NOTIFICATION_CONFIG;
  }
  return { reportReleasedChannels: channels as Channel[] };
}

export const TEMPLATE_VERSION = 1;

/** Only information the customer may already see: the released report's title and their family name. */
export function renderReportReleased(input: { reportTitle: string; workspaceName: string }): { title: string; body: string } {
  return {
    title: 'A research report is ready',
    body: `The report “${input.reportTitle.slice(0, 150)}” for ${input.workspaceName.slice(0, 120)} has been reviewed and released. Open Research & reports to read it.`,
  };
}
