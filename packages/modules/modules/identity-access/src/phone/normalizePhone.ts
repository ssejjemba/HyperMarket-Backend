export const normalizePhone = (value: string): string => {
  return value.replace(/\s+/g, '').trim();
};
