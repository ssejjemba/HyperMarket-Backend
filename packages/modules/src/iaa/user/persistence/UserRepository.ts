import type { UserIdentity } from '../domain/UserIdentity';

export interface UserRepository {
  /** Find a user by their E.164 phone number. Returns null when not found. */
  findByPhone(phoneE164: string): Promise<UserIdentity | null>;

  /** Create a new active user with the given phone number. */
  createWithPhone(phoneE164: string): Promise<UserIdentity>;
}
