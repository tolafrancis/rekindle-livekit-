// =============================================================================
// Ministry roles & capabilities — single source of truth
// Folder: src/lib/ministry/
// -----------------------------------------------------------------------------
// Roles (most → least privileged):
//   owner          – the creator. The only role that can delete the ministry or
//                    transfer ownership.
//   leader         – full management access (everything an admin can do).
//   admin          – everything EXCEPT deleting the ministry or transferring
//                    ownership.
//   content_editor – create/edit content only.
//   member         – no management access.
//
// Storage: ministry_groups.owner_id / leader_id, plus ministry_members.role and
// ministry_members.is_leader. is_leader === true is treated as the 'leader' role.
// This mirrors the SQL ga_is_ministry_admin() check used by the Gift Aid module
// (owner_id / leader_id OR ministry_members.is_leader OR role = 'admin').
// =============================================================================

export type MinistryRole = 'owner' | 'leader' | 'admin' | 'content_editor' | 'member';

export type MinistryCapability =
  | 'manage_content'
  | 'manage_members'
  | 'manage_roles'
  | 'manage_donations'
  | 'manage_events'
  | 'manage_gift_aid'
  | 'delete_ministry'
  | 'transfer_ownership';

const ALL: MinistryCapability[] = [
  'manage_content', 'manage_members', 'manage_roles', 'manage_donations',
  'manage_events', 'manage_gift_aid', 'delete_ministry', 'transfer_ownership',
];

// Everything except the two owner-only powers.
const FULL_EXCEPT_OWNER_ONLY = ALL.filter(
  (c) => c !== 'delete_ministry' && c !== 'transfer_ownership',
);

const CAPABILITIES: Record<MinistryRole, MinistryCapability[]> = {
  owner: ALL,
  leader: FULL_EXCEPT_OWNER_ONLY,
  admin: FULL_EXCEPT_OWNER_ONLY,
  content_editor: ['manage_content'],
  member: [],
};

export const ROLE_LABELS: Record<MinistryRole, string> = {
  owner: 'Owner',
  leader: 'Leader',
  admin: 'Admin',
  content_editor: 'Content Editor',
  member: 'Member',
};

export const ROLE_DESCRIPTIONS: Record<MinistryRole, string> = {
  owner: 'Full control, including deleting the ministry and transferring ownership.',
  leader: 'Full management access.',
  admin: 'Everything except deleting the ministry or transferring ownership.',
  content_editor: 'Create and edit content.',
  member: 'No management access.',
};

/** Roles an owner/leader/admin can assign through the UI (owner is never assignable here). */
export const ASSIGNABLE_ROLES: MinistryRole[] = ['leader', 'admin', 'content_editor', 'member'];

export function roleCan(role: MinistryRole | null | undefined, cap: MinistryCapability): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(cap) ?? false;
}

export function roleLabel(role: MinistryRole | null | undefined): string {
  return role ? ROLE_LABELS[role] : '';
}

/** Normalise a stored (role, is_leader) pair into a MinistryRole. */
export function normaliseRole(
  rawRole: string | null | undefined,
  isLeader?: boolean | null,
): MinistryRole {
  const r = (rawRole || '').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'leader' || isLeader === true) return 'leader';
  if (r === 'admin') return 'admin';
  if (r === 'content_editor' || r === 'content editor' || r === 'editor') return 'content_editor';
  return 'member';
}

/**
 * Resolve a user's effective role in a ministry from the structured ownership
 * fields plus their membership row. owner_id / leader_id win over the row.
 */
export function resolveMinistryRole(args: {
  userId: string | null | undefined;
  ownerId?: string | null;
  leaderId?: string | null;
  memberRole?: string | null;
  memberIsLeader?: boolean | null;
}): MinistryRole | null {
  const { userId, ownerId, leaderId, memberRole, memberIsLeader } = args;
  if (!userId) return null;
  if (ownerId && userId === ownerId) return 'owner';
  if (leaderId && userId === leaderId) return 'leader';
  if (memberRole == null && memberIsLeader == null) return null; // not a member
  return normaliseRole(memberRole, memberIsLeader);
}

/** Convert a chosen role into the columns stored on ministry_members. */
export function roleToMemberColumns(role: MinistryRole): { role: string; is_leader: boolean } {
  return { role, is_leader: role === 'leader' };
}
