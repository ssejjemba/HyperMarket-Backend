import { PhoneNumber } from '../../iaa';

export const maskNotificationRecipient = (recipient: string): string => {
  try {
    return PhoneNumber.parse(recipient).toMasked();
  } catch {
    const normalized = recipient.trim().toLowerCase();
    const [localPart, domain] = normalized.split('@');

    if (domain === undefined || localPart === undefined || localPart.length < 2) {
      return '***';
    }

    return `${localPart[0]}***@${domain}`;
  }
};
