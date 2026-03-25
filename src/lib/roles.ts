export const Role = {
  TEACHER: "TEACHER",
  STUDENT: "STUDENT"
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export function isRole(value: string): value is Role {
  return value === Role.TEACHER || value === Role.STUDENT;
}
