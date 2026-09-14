import { z } from 'zod';

export const AdminPaginationSchema = z.object({
  pageNum: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  searchKey: z.string().trim().max(100).optional()
});
export const AdminIdPathSchema = z.object({ id: z.string() });

export const AdminUserStatusSchema = z.enum(['active', 'forbidden']);
export const AdminTeamStatusSchema = z.enum(['active', 'frozen']);

export const AdminUserListQuerySchema = AdminPaginationSchema.extend({
  status: AdminUserStatusSchema.optional(),
  teamId: z.string().optional()
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;

export const AdminUserListItemSchema = z.object({
  id: z.string(),
  username: z.string(),
  contact: z.string().optional(),
  loginType: z.string().optional(),
  status: AdminUserStatusSchema,
  createTime: z.coerce.date(),
  teamCount: z.number().int().nonnegative(),
  appCount: z.number().int().nonnegative(),
  datasetCount: z.number().int().nonnegative(),
  isRoot: z.boolean()
});
export type AdminUserListItem = z.infer<typeof AdminUserListItemSchema>;

export const AdminUserDetailSchema = AdminUserListItemSchema.extend({
  timezone: z.string().optional(),
  language: z.string().optional(),
  teams: z.array(
    z.object({
      teamId: z.string(),
      teamName: z.string(),
      tmbId: z.string(),
      memberName: z.string(),
      status: z.string(),
      isOwner: z.boolean()
    })
  )
});
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;

export const AdminCreateUserSchema = z.object({
  username: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(128),
  contact: z.string().trim().max(100).optional(),
  timezone: z.string().trim().max(100).optional(),
  language: z.string().trim().max(30).optional()
});

export const AdminUpdateUserSchema = z.object({
  id: z.string(),
  contact: z.string().trim().max(100).optional(),
  timezone: z.string().trim().max(100).optional(),
  language: z.string().trim().max(30).optional()
});

export const AdminUserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('freeze'), userId: z.string() }),
  z.object({ action: z.literal('unfreeze'), userId: z.string() }),
  z.object({
    action: z.literal('resetPassword'),
    userId: z.string(),
    password: z.string().min(8).max(128)
  }),
  z.object({
    action: z.literal('transfer'),
    userId: z.string(),
    targetUserId: z.string()
  }),
  z.object({
    action: z.literal('delete'),
    userId: z.string(),
    confirmName: z.string()
  })
]);
export type AdminUserAction = z.infer<typeof AdminUserActionSchema>;

export const AdminTeamListQuerySchema = AdminPaginationSchema.extend({
  status: AdminTeamStatusSchema.optional(),
  ownerId: z.string().optional()
});
export type AdminTeamListQuery = z.infer<typeof AdminTeamListQuerySchema>;

export const AdminTeamListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  ownerId: z.string(),
  ownerName: z.string(),
  status: AdminTeamStatusSchema,
  createTime: z.coerce.date(),
  memberCount: z.number().int().nonnegative(),
  appCount: z.number().int().nonnegative(),
  datasetCount: z.number().int().nonnegative()
});
export type AdminTeamListItem = z.infer<typeof AdminTeamListItemSchema>;

export const AdminTeamMemberSchema = z.object({
  tmbId: z.string(),
  userId: z.string(),
  username: z.string(),
  memberName: z.string(),
  status: z.string(),
  isOwner: z.boolean(),
  createTime: z.coerce.date()
});
export const AdminTeamGroupMemberSchema = z.object({
  tmbId: z.string(),
  role: z.enum(['owner', 'admin', 'member'])
});

export const AdminTeamDetailSchema = AdminTeamListItemSchema.extend({
  teamDomain: z.string().optional(),
  balance: z.number().optional(),
  members: z.array(AdminTeamMemberSchema),
  orgs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      pathId: z.string(),
      tmbIds: z.array(z.string())
    })
  ),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tmbIds: z.array(z.string()),
      members: z.array(AdminTeamGroupMemberSchema)
    })
  )
});
export type AdminTeamDetail = z.infer<typeof AdminTeamDetailSchema>;

export const AdminCreateTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  ownerId: z.string(),
  avatar: z.string().trim().max(500).optional()
});

export const AdminUpdateTeamSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100).optional(),
  avatar: z.string().trim().max(500).optional(),
  teamDomain: z.string().trim().max(200).optional()
});

export const AdminTeamActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('freeze'), teamId: z.string() }),
  z.object({ action: z.literal('unfreeze'), teamId: z.string() }),
  z.object({ action: z.literal('transferOwner'), teamId: z.string(), targetUserId: z.string() }),
  z.object({ action: z.literal('addMember'), teamId: z.string(), userId: z.string() }),
  z.object({ action: z.literal('removeMember'), teamId: z.string(), tmbId: z.string() }),
  z.object({
    action: z.literal('updateMember'),
    teamId: z.string(),
    tmbId: z.string(),
    name: z.string().trim().min(1).max(100)
  }),
  z.object({
    action: z.literal('updateMemberStatus'),
    teamId: z.string(),
    tmbId: z.string(),
    status: z.enum(['active', 'forbidden'])
  }),
  z.object({
    action: z.literal('createOrg'),
    teamId: z.string(),
    name: z.string().trim().min(1).max(100),
    parentOrgId: z.string().optional()
  }),
  z.object({
    action: z.literal('updateOrg'),
    teamId: z.string(),
    orgId: z.string(),
    name: z.string().trim().min(1).max(100),
    tmbIds: z.array(z.string()).optional()
  }),
  z.object({ action: z.literal('deleteOrg'), teamId: z.string(), orgId: z.string() }),
  z.object({
    action: z.literal('moveOrg'),
    teamId: z.string(),
    orgId: z.string(),
    parentOrgId: z.string()
  }),
  z.object({
    action: z.literal('updateOrgMembers'),
    teamId: z.string(),
    orgId: z.string(),
    tmbIds: z.array(z.string())
  }),
  z.object({
    action: z.literal('createGroup'),
    teamId: z.string(),
    name: z.string().trim().min(1).max(100),
    members: z.array(AdminTeamGroupMemberSchema).default([])
  }),
  z.object({
    action: z.literal('updateGroup'),
    teamId: z.string(),
    groupId: z.string(),
    name: z.string().trim().min(1).max(100),
    members: z.array(AdminTeamGroupMemberSchema).default([])
  }),
  z.object({ action: z.literal('deleteGroup'), teamId: z.string(), groupId: z.string() }),
  z.object({
    action: z.literal('updateBalance'),
    teamId: z.string(),
    balance: z.number().nonnegative()
  }),
  z.object({ action: z.literal('delete'), teamId: z.string(), confirmName: z.string() })
]);
export type AdminTeamAction = z.infer<typeof AdminTeamActionSchema>;

export const AdminResourceListQuerySchema = AdminPaginationSchema.extend({
  teamId: z.string().optional(),
  ownerId: z.string().optional(),
  type: z.string().optional()
});
export type AdminResourceListQuery = z.infer<typeof AdminResourceListQuerySchema>;

export const AdminAppListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  intro: z.string(),
  type: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  updateTime: z.coerce.date()
});
export type AdminAppListItem = z.infer<typeof AdminAppListItemSchema>;

export const AdminAppDetailSchema = AdminAppListItemSchema.extend({
  version: z.string().optional(),
  parentId: z.string().optional(),
  inheritPermission: z.boolean().optional()
});

export const AdminDatasetListItemSchema = AdminAppListItemSchema.extend({
  collectionCount: z.number().int().nonnegative(),
  dataCount: z.number().int().nonnegative(),
  indexSize: z.number().nonnegative()
});
export type AdminDatasetListItem = z.infer<typeof AdminDatasetListItemSchema>;

export const AdminDatasetDetailSchema = AdminAppListItemSchema.extend({
  status: z.string().optional(),
  vectorModel: z.string().optional(),
  agentModel: z.string().optional(),
  parentId: z.string().optional(),
  inheritPermission: z.boolean().optional(),
  collectionCount: z.number().int().nonnegative(),
  dataCount: z.number().int().nonnegative()
});

export const AdminTaskStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);
export const AdminTaskListQuerySchema = AdminPaginationSchema.extend({
  status: AdminTaskStatusSchema.optional(),
  type: z.string().trim().max(100).optional()
});
export type AdminTaskListQuery = z.infer<typeof AdminTaskListQuerySchema>;
export const AdminTaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  targetName: z.string(),
  status: AdminTaskStatusSchema,
  progress: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});
export type AdminTask = z.infer<typeof AdminTaskSchema>;

export const AdminTaskActionSchema = z.object({
  action: z.literal('retry'),
  taskId: z.string()
});

export const AdminAuditListQuerySchema = AdminPaginationSchema.extend({
  event: z.string().trim().max(100).optional(),
  targetType: z.string().trim().max(100).optional(),
  success: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional()
});
export type AdminAuditListQuery = z.infer<typeof AdminAuditListQuerySchema>;

export const AdminAuditSchema = z.object({
  id: z.string(),
  event: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  targetName: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  ip: z.string().optional(),
  createdAt: z.coerce.date(),
  taskId: z.string().optional()
});
export type AdminAudit = z.infer<typeof AdminAuditSchema>;

export const AdminPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({ total: z.number().int().nonnegative(), list: z.array(itemSchema) });
