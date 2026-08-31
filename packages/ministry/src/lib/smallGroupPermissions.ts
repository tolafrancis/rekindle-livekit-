// =============================================================================
// Small Group roles & capabilities — single source of truth
// -----------------------------------------------------------------------------
// Deliberately separate from packages/auth/src/ministryPermissions.ts's
// MinistryRole. A Small Group role is scoped to ONE group, not the whole
// ministry — a group leader must not automatically gain access to other
// ministry administrative functions. Ministry-wide owner/admin/leader access
// (via ministryPermissions.roleCan(..., 'manage_members')) and Small Group
// Coordinator access (small_group_coordinators table) both resolve to
// 'ministry_admin' here, since both can manage every group in the ministry;
// everything below that is per-group.
//
// Roles (most -> least privileged):
//   ministry_admin   – ministry owner/leader/admin, or a Small Group
//                       Coordinator. Manages every group in the ministry.
//   leader            – manages one group fully (members, meetings,
//                       attendance, posts, settings) but nothing else.
//   assistant_leader  – helps run one group's meetings/attendance/posts, but
//                       cannot approve/remove members or edit group settings.
//   member            – can participate (discussion/prayer posts) in groups
//                       they belong to.
// =============================================================================

export type SmallGroupRole = 'ministry_admin' | 'leader' | 'assistant_leader' | 'member' | null;

export type SmallGroupCapability =
  | 'edit_group_settings'
  | 'archive_delete_group'
  | 'manage_members'
  | 'manage_meetings'
  | 'record_attendance'
  | 'post_announcement_resource'
  | 'post_discussion_prayer';

const ALL: SmallGroupCapability[] = [
  'edit_group_settings', 'archive_delete_group', 'manage_members',
  'manage_meetings', 'record_attendance', 'post_announcement_resource',
  'post_discussion_prayer',
];

const LEADER_CAPS: SmallGroupCapability[] = [
  'edit_group_settings', 'manage_members', 'manage_meetings',
  'record_attendance', 'post_announcement_resource', 'post_discussion_prayer',
]; // everything except archiving/deleting the group itself

const ASSISTANT_LEADER_CAPS: SmallGroupCapability[] = [
  'manage_meetings', 'record_attendance', 'post_discussion_prayer',
];

const MEMBER_CAPS: SmallGroupCapability[] = ['post_discussion_prayer'];

const CAPABILITIES: Record<Exclude<SmallGroupRole, null>, SmallGroupCapability[]> = {
  ministry_admin: ALL,
  leader: LEADER_CAPS,
  assistant_leader: ASSISTANT_LEADER_CAPS,
  member: MEMBER_CAPS,
};

export const SMALL_GROUP_ROLE_LABELS: Record<Exclude<SmallGroupRole, null>, string> = {
  ministry_admin: 'Ministry Admin',
  leader: 'Group Leader',
  assistant_leader: 'Assistant Leader',
  member: 'Member',
};

/** Roles assignable to a small_group_members row through the UI. */
export const ASSIGNABLE_SMALL_GROUP_ROLES: Array<'leader' | 'assistant_leader' | 'member'> = [
  'leader', 'assistant_leader', 'member',
];

export function smallGroupRoleCan(
  role: SmallGroupRole | null | undefined,
  cap: SmallGroupCapability,
): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(cap) ?? false;
}

/**
 * Resolve a user's effective Small Group role for one group.
 *
 * `isMinistryAdmin` should come from the caller resolving the user's
 * ministry-wide MinistryRole via @rekindle/auth/ministryPermissions
 * (roleCan(ministryRole, 'manage_members')), OR from a
 * small_group_coordinators row for this ministry — both grant
 * 'ministry_admin' here.
 */
export function resolveSmallGroupRole(args: {
  userId: string | null | undefined;
  isMinistryAdmin: boolean;
  isCoordinator: boolean;
  memberRole?: string | null; // small_group_members.role for this user+group, if any
  memberStatus?: string | null; // small_group_members.status for this user+group, if any
}): SmallGroupRole {
  const { userId, isMinistryAdmin, isCoordinator, memberRole, memberStatus } = args;
  if (!userId) return null;
  if (isMinistryAdmin || isCoordinator) return 'ministry_admin';
  if (memberStatus !== 'active') return null; // pending/declined/removed/no row = not a participant
  if (memberRole === 'leader') return 'leader';
  if (memberRole === 'assistant_leader') return 'assistant_leader';
  return 'member';
}
