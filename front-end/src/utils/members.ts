import { compareNames } from './alphabetical';

export interface StructuredMember {
  lastName: string;
  firstName: string;
  middleName?: string;
}

export type Member = string | StructuredMember;

export const formatMemberName = (member: Member) => {
  if (typeof member === 'string') return member;
  return [member.firstName, member.middleName, member.lastName]
    .filter(Boolean)
    .join(' ');
};

export const formatMemberList = (members: Member[] = [], separator = ', ') => (
  members.map(formatMemberName).filter(Boolean).join(separator)
);

export const memberSearchText = (member: Member) => {
  if (typeof member === 'string') return member.toLowerCase();
  return [member.lastName, member.firstName, member.middleName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const compareMembers = (a: Member, b: Member) => {
  const left = typeof a === 'string' ? { lastName: a, firstName: '', middleName: '' } : a;
  const right = typeof b === 'string' ? { lastName: b, firstName: '', middleName: '' } : b;
  return compareNames(left.lastName, right.lastName) || compareNames(left.firstName, right.firstName) || compareNames(left.middleName, right.middleName);
};
