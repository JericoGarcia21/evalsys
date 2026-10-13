const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const compareNames = (a, b) => {
  const left = String(a || '').trim().normalize('NFKC');
  const right = String(b || '').trim().normalize('NFKC');
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return collator.compare(left, right);
};

const nameParts = (member) => typeof member === 'string'
  ? [member, '', '']
  : [member?.lastName, member?.firstName, member?.middleName];

const compareMembers = (a, b) => {
  const left = nameParts(a);
  const right = nameParts(b);
  return compareNames(left[0], right[0]) || compareNames(left[1], right[1]) || compareNames(left[2], right[2]);
};

module.exports = { compareNames, compareMembers };
