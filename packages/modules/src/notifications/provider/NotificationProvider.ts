export type NotificationSendMessage = {
  channel: 'sms' | 'whatsapp' | 'email';
  recipient: string;
  text: string;
  payload: Record<string, unknown>;
  tenantId?: string | undefined;
  correlationId?: string | undefined;
};

export type NotificationProviderSendResult = {
  status: 'SENT' | 'FAILED';
  provider: string;
  providerMessageId?: string | null;
  failureCategory?: string | null;
  retryable: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type NotificationProvider = {
  readonly providerName: string;
  send(message: NotificationSendMessage): Promise<NotificationProviderSendResult>;
};
