import type { OtpChallenge } from '../domain/OtpChallenge';

export type CreateChallengeInput = {
  phoneE164: string;
  codeHash: string;
  expiresAt: Date;
  maxAttempts: number;
  lastSentAt: Date;
};

export interface OtpChallengeRepository {
  /** Persist a new challenge and return the saved entity (id and createdAt filled by DB). */
  createChallenge(input: CreateChallengeInput): Promise<OtpChallenge>;

  /** Load a challenge by its primary key. Returns null when not found. */
  getChallengeById(id: string): Promise<OtpChallenge | null>;

  /**
   * Persist the mutable state of a challenge back to the database.
   * Only `attempt_count`, `status`, and `last_sent_at` are updated.
   */
  updateChallenge(challenge: OtpChallenge): Promise<void>;

  /**
   * Count challenges created for a phone number since `since`.
   * Used by rate-limiting guards in the application service.
   */
  countRecentChallengesForPhone(phoneE164: string, since: Date): Promise<number>;
}
