import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../../errors/IaaError';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type OtpChallengeStatus = 'ACTIVE' | 'CONSUMED' | 'LOCKED' | 'EXPIRED' | 'SEND_FAILED';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface OtpChallengeProps {
  id: string;
  phoneE164: string;
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
  status: OtpChallengeStatus;
  createdAt: Date;
  lastSentAt: Date;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * Pure domain entity representing a one-time password challenge.
 *
 * All state transitions are performed via mutating methods that throw
 * typed `IaaError`s on policy violations. No I/O touches this class.
 */
export class OtpChallenge {
  readonly id: string;
  readonly phoneE164: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly maxAttempts: number;
  readonly createdAt: Date;

  private _attemptCount: number;
  private _status: OtpChallengeStatus;
  private _lastSentAt: Date;

  constructor(props: OtpChallengeProps) {
    this.id = props.id;
    this.phoneE164 = props.phoneE164;
    this.codeHash = props.codeHash;
    this.expiresAt = props.expiresAt;
    this.maxAttempts = props.maxAttempts;
    this.createdAt = props.createdAt;
    this._attemptCount = props.attemptCount;
    this._status = props.status;
    this._lastSentAt = props.lastSentAt;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get attemptCount(): number {
    return this._attemptCount;
  }

  get status(): OtpChallengeStatus {
    return this._status;
  }

  get lastSentAt(): Date {
    return this._lastSentAt;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  isExpired(now: Date): boolean {
    return now >= this.expiresAt;
  }

  // ---------------------------------------------------------------------------
  // Assertions — throw if the precondition is not met
  // ---------------------------------------------------------------------------

  /**
   * Throws if the challenge cannot accept a verification attempt right now.
   * Order of checks: LOCKED → CONSUMED → EXPIRED → non-ACTIVE status.
   */
  assertActive(now: Date): void {
    if (this._status === 'LOCKED') {
      throw new IaaError({
        code: ErrorCode.AuthChallengeLocked,
        message: 'This OTP challenge is locked due to too many failed attempts'
      });
    }

    if (this._status === 'CONSUMED') {
      throw new IaaError({
        code: ErrorCode.AuthChallengeConsumed,
        message: 'This OTP challenge has already been used'
      });
    }

    if (this.isExpired(now)) {
      this._status = 'EXPIRED';
      throw new IaaError({
        code: ErrorCode.AuthChallengeExpired,
        message: 'This OTP challenge has expired'
      });
    }

    if (this._status !== 'ACTIVE') {
      throw new IaaError({
        code: ErrorCode.AuthChallengeExpired,
        message: 'This OTP challenge is no longer active'
      });
    }
  }

  assertPhoneMatches(phoneE164: string): void {
    if (this.phoneE164 !== phoneE164) {
      throw new IaaError({
        code: ErrorCode.AuthChallengePhoneMismatch,
        message: 'The phone number does not match this OTP challenge'
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Record one failed verification attempt.
   * Transitions to LOCKED when `maxAttempts` is reached.
   */
  recordFailedAttempt(now: Date): void {
    this.assertActive(now);
    this._attemptCount += 1;
    if (this._attemptCount >= this.maxAttempts) {
      this._status = 'LOCKED';
    }
  }

  /**
   * Mark the challenge as successfully consumed.
   * Caller must have already verified the code hash.
   */
  consume(now: Date): void {
    this.assertActive(now);
    this._status = 'CONSUMED';
  }

  /**
   * Update lastSentAt when the OTP code is (re-)sent to the phone.
   * Called by the application service after a successful provider send.
   */
  recordSent(now: Date): void {
    this._lastSentAt = now;
  }

  /**
   * Mark the challenge as SEND_FAILED when the provider could not deliver.
   * The challenge may not be retried — the caller should create a new one.
   */
  markSendFailed(): void {
    this._status = 'SEND_FAILED';
  }
}
