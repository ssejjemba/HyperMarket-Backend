const isAlphaNumeric = (value: string): boolean => {
  const code = value.charCodeAt(0);
  const isDigit = code >= 48 && code <= 57;
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;

  return isDigit || isUpper || isLower;
};

export const sanitizeOriginalFilename = (filename: string | undefined): string | null => {
  if (filename === undefined) {
    return null;
  }

  const trimmed = filename.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const sanitizedChars: string[] = [];
  let previousWasDash = false;

  for (const char of trimmed) {
    if (isAlphaNumeric(char)) {
      sanitizedChars.push(char.toLowerCase());
      previousWasDash = false;
      continue;
    }

    if (char === '.') {
      sanitizedChars.push('.');
      previousWasDash = false;
      continue;
    }

    if (previousWasDash === false) {
      sanitizedChars.push('-');
      previousWasDash = true;
    }
  }

  const sanitized = sanitizedChars.join('').replace(/^-+|-+$/g, '');
  if (sanitized.length === 0) {
    return null;
  }

  return sanitized;
};

export const buildMediaStorageKey = (input: {
  tenantId: string;
  assetId: string;
  originalFilename?: string | undefined;
}): string => {
  const sanitizedFilename = sanitizeOriginalFilename(input.originalFilename);
  if (sanitizedFilename === null) {
    return `tenants/${input.tenantId}/assets/${input.assetId}`;
  }

  return `tenants/${input.tenantId}/assets/${input.assetId}/${sanitizedFilename}`;
};
