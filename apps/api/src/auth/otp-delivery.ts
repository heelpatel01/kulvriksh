// Delivery of one-time codes. No SMS provider has been chosen, so the only implementation is the
// development outbox below. A real provider will implement OtpSender; nothing else changes.

export interface OtpSender {
  /** Resolves once the provider has accepted the message; rejects when it could not be sent. */
  send(mobileNumber: string, code: string, expiresAt: Date): Promise<void>;
}

interface OutboxEntry {
  code: string;
  expiresAt: Date;
}

/**
 * Development only: keeps the latest code per number in process memory, standing in for the
 * phone's SMS inbox. It never logs, never persists, and drops entries once they expire. The
 * configuration refuses OTP_DELIVERY=development outside NODE_ENV=development, and the route
 * that reads it is registered only in that case.
 */
export class DevelopmentOtpOutbox implements OtpSender {
  readonly #entries = new Map<string, OutboxEntry>();
  readonly #now: () => Date;
  #failNext = false;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async send(mobileNumber: string, code: string, expiresAt: Date): Promise<void> {
    if (this.#failNext) {
      this.#failNext = false;
      throw new Error('development outbox: simulated delivery failure');
    }
    this.#purge();
    this.#entries.set(mobileNumber, { code, expiresAt });
  }

  /** The latest unexpired code for a number, as the phone would show it. */
  read(mobileNumber: string): OutboxEntry | undefined {
    this.#purge();
    return this.#entries.get(mobileNumber);
  }

  /** Makes the next send fail, to exercise the provider-failure path (AS-AUTH-04). */
  failNextSend(): void {
    this.#failNext = true;
  }

  #purge(): void {
    const now = this.#now().getTime();
    for (const [number, entry] of this.#entries) {
      if (entry.expiresAt.getTime() <= now) {
        this.#entries.delete(number);
      }
    }
  }
}
