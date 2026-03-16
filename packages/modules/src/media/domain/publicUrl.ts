export const buildMediaPublicUrl = (cdnBaseUrl: string, storageKey: string): string => {
  const normalizedBaseUrl = cdnBaseUrl.replace(/\/+$/g, '');
  const normalizedStorageKey = storageKey.replace(/^\/+/g, '');

  return `${normalizedBaseUrl}/${normalizedStorageKey}`;
};
