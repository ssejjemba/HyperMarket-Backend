type OtpSinkEntry = {
  otpCode: string;
  expiresAt: Date;
};

export interface OtpSink {
  put(challengeId: string, otpCode: string, expiresAt: Date): void;
  get(challengeId: string): OtpSinkEntry | null;
  delete(challengeId: string): boolean;
  clear(): void;
}

const createInMemoryOtpSink = (): OtpSink => {
  const entries = new Map<string, OtpSinkEntry>();

  const isExpired = (expiresAt: Date): boolean => expiresAt.getTime() <= Date.now();

  const deleteIfExpired = (challengeId: string): boolean => {
    const entry = entries.get(challengeId);
    if (entry === undefined) {
      return false;
    }

    if (isExpired(entry.expiresAt)) {
      entries.delete(challengeId);
      return true;
    }

    return false;
  };

  return {
    put(challengeId: string, otpCode: string, expiresAt: Date): void {
      if (isExpired(expiresAt)) {
        entries.delete(challengeId);
        return;
      }

      entries.set(challengeId, { otpCode, expiresAt });
    },

    get(challengeId: string): OtpSinkEntry | null {
      deleteIfExpired(challengeId);
      return entries.get(challengeId) ?? null;
    },

    delete(challengeId: string): boolean {
      deleteIfExpired(challengeId);
      return entries.delete(challengeId);
    },

    clear(): void {
      entries.clear();
    }
  };
};

export const otpSink = createInMemoryOtpSink();
