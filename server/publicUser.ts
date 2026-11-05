import { getTableColumns } from "drizzle-orm";
import { users, type User } from "../drizzle/schema";

/** Password hashes stay on the server: never select them for data returned by an API route. */
const { passwordHash: _passwordHash, ...publicUserColumnSet } = getTableColumns(users);
export const publicUserColumns = publicUserColumnSet;

export function toPublicUser(user: User | null): Omit<User, "passwordHash"> | null {
  if (!user) return null;
  const { passwordHash: _hash, ...publicUser } = user;
  return publicUser;
}
