import type { PhoneNumber } from '../phone/PhoneNumber';
import type { UserIdentity } from './domain/UserIdentity';
import type { UserRepository } from './persistence/UserRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserServiceDeps = {
  repo: UserRepository;
};

export type UserService = {
  /**
   * Return the existing user for the phone number, or create one on first
   * verified login. Throws AUTH_USER_SUSPENDED if the account is inactive.
   */
  getOrCreateByPhone(phone: PhoneNumber): Promise<UserIdentity>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createUserService = (deps: UserServiceDeps): UserService => ({
  async getOrCreateByPhone(phone: PhoneNumber): Promise<UserIdentity> {
    const phoneE164 = phone.toE164();

    let user = await deps.repo.findByPhone(phoneE164);

    if (user === null) {
      user = await deps.repo.createWithPhone(phoneE164);
    }

    user.assertActive();

    return user;
  }
});
