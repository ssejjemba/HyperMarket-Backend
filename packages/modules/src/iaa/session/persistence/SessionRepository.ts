export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export interface SessionRepository {
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord>;
  getSessionById(sessionId: string): Promise<SessionRecord | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
