// Delivery of staff password-reset links. No email provider has been chosen (R37), so the only
// implementation is a development outbox. A real provider implements StaffMessageSender; nothing
// else changes. Without one, reset requests still answer generically and nothing is sent.

export interface StaffMessageSender {
  sendPasswordReset(email: string, token: string, expiresAt: Date): Promise<void>;
}

/**
 * Development only: keeps the latest reset link per email in process memory, standing in for the
 * person's inbox. Never logged or persisted. Created only when OTP_DELIVERY=development, which the
 * configuration refuses outside NODE_ENV=development.
 */
export class DevelopmentStaffOutbox implements StaffMessageSender {
  readonly #entries = new Map<string, { token: string; expiresAt: Date }>();

  async sendPasswordReset(email: string, token: string, expiresAt: Date): Promise<void> {
    this.#entries.set(email, { token, expiresAt });
  }

  read(email: string): { token: string; expiresAt: Date } | undefined {
    const entry = this.#entries.get(email);
    if (entry && entry.expiresAt.getTime() <= Date.now()) {
      this.#entries.delete(email);
      return undefined;
    }
    return entry;
  }
}
