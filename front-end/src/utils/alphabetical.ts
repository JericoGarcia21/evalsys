const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** A–Z regardless of case/accents; unnamed entries follow named entries. */
export const compareNames = (a: string | null | undefined, b: string | null | undefined) => {
  const left = (a || '').trim().normalize('NFKC');
  const right = (b || '').trim().normalize('NFKC');
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return collator.compare(left, right);
};
