// signups_one_active_per_user (0002) has no custom message, since a unique
// index can't carry one — translate the raw constraint violation into the
// same "one active group at a time" wording DESIGN.md §4.3 describes.
export const ONE_ACTIVE_GROUP_MESSAGE =
  "You're already in a trip. Leave your current trip before joining another.";

export function friendlyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return ONE_ACTIVE_GROUP_MESSAGE;
  return error.message;
}
