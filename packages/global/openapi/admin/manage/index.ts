import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  AdminAppListItemSchema,
  AdminAppDetailSchema,
  AdminAuditListQuerySchema,
  AdminAuditSchema,
  AdminCreateTeamSchema,
  AdminCreateUserSchema,
  AdminDatasetListItemSchema,
  AdminDatasetDetailSchema,
  AdminIdPathSchema,
  AdminPaginatedResponseSchema,
  AdminResourceListQuerySchema,
  AdminTaskSchema,
  AdminTaskActionSchema,
  AdminTaskListQuerySchema,
  AdminTeamActionSchema,
  AdminTeamDetailSchema,
  AdminTeamListItemSchema,
  AdminTeamListQuerySchema,
  AdminUpdateTeamSchema,
  AdminUpdateUserSchema,
  AdminUserActionSchema,
  AdminUserDetailSchema,
  AdminUserListItemSchema,
  AdminUserListQuerySchema
} from './api';

export const AdminManagePath: OpenAPIPath = {
  '/admin/users': {
    get: {
      summary: '查询用户',
      tags: [TagsMap.adminUsers],
      requestParams: { query: AdminUserListQuerySchema },
      responses: {
        200: {
          description: '用户列表',
          content: {
            'application/json': { schema: AdminPaginatedResponseSchema(AdminUserListItemSchema) }
          }
        }
      }
    },
    post: {
      summary: '创建用户',
      tags: [TagsMap.adminUsers],
      requestBody: { content: { 'application/json': { schema: AdminCreateUserSchema } } },
      responses: { 200: { description: '创建成功' } }
    },
    put: {
      summary: '更新用户',
      tags: [TagsMap.adminUsers],
      requestBody: { content: { 'application/json': { schema: AdminUpdateUserSchema } } },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/admin/users/{id}': {
    get: {
      summary: '用户详情',
      tags: [TagsMap.adminUsers],
      requestParams: { path: AdminIdPathSchema },
      responses: {
        200: {
          description: '用户详情',
          content: { 'application/json': { schema: AdminUserDetailSchema } }
        }
      }
    }
  },
  '/admin/users/action': {
    post: {
      summary: '执行用户管理动作',
      tags: [TagsMap.adminUsers],
      requestBody: { content: { 'application/json': { schema: AdminUserActionSchema } } },
      responses: { 200: { description: '提交成功' } }
    }
  },
  '/admin/teams': {
    get: {
      summary: '查询团队',
      tags: [TagsMap.adminTeams],
      requestParams: { query: AdminTeamListQuerySchema },
      responses: {
        200: {
          description: '团队列表',
          content: {
            'application/json': { schema: AdminPaginatedResponseSchema(AdminTeamListItemSchema) }
          }
        }
      }
    },
    post: {
      summary: '创建团队',
      tags: [TagsMap.adminTeams],
      requestBody: { content: { 'application/json': { schema: AdminCreateTeamSchema } } },
      responses: { 200: { description: '创建成功' } }
    },
    put: {
      summary: '更新团队',
      tags: [TagsMap.adminTeams],
      requestBody: { content: { 'application/json': { schema: AdminUpdateTeamSchema } } },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/admin/teams/{id}': {
    get: {
      summary: '团队详情',
      tags: [TagsMap.adminTeams],
      requestParams: { path: AdminIdPathSchema },
      responses: {
        200: {
          description: '团队详情',
          content: { 'application/json': { schema: AdminTeamDetailSchema } }
        }
      }
    }
  },
  '/admin/teams/action': {
    post: {
      summary: '执行团队管理动作',
      tags: [TagsMap.adminTeams],
      requestBody: { content: { 'application/json': { schema: AdminTeamActionSchema } } },
      responses: { 200: { description: '提交成功' } }
    }
  },
  '/admin/apps': {
    get: {
      summary: '查询应用',
      tags: [TagsMap.adminApps],
      requestParams: { query: AdminResourceListQuerySchema },
      responses: {
        200: {
          description: '应用列表',
          content: {
            'application/json': { schema: AdminPaginatedResponseSchema(AdminAppListItemSchema) }
          }
        }
      }
    }
  },
  '/admin/apps/{id}': {
    get: {
      summary: '应用详情',
      tags: [TagsMap.adminApps],
      requestParams: { path: AdminIdPathSchema },
      responses: {
        200: {
          description: '应用详情',
          content: { 'application/json': { schema: AdminAppDetailSchema } }
        }
      }
    }
  },
  '/admin/datasets': {
    get: {
      summary: '查询知识库',
      tags: [TagsMap.adminDatasets],
      requestParams: { query: AdminResourceListQuerySchema },
      responses: {
        200: {
          description: '知识库列表',
          content: {
            'application/json': { schema: AdminPaginatedResponseSchema(AdminDatasetListItemSchema) }
          }
        }
      }
    }
  },
  '/admin/datasets/{id}': {
    get: {
      summary: '知识库详情',
      tags: [TagsMap.adminDatasets],
      requestParams: { path: AdminIdPathSchema },
      responses: {
        200: {
          description: '知识库详情',
          content: { 'application/json': { schema: AdminDatasetDetailSchema } }
        }
      }
    }
  },
  '/admin/tasks': {
    get: {
      summary: '查询管理任务',
      tags: [TagsMap.adminTasks],
      requestParams: { query: AdminTaskListQuerySchema },
      responses: {
        200: {
          description: '任务列表',
          content: { 'application/json': { schema: AdminPaginatedResponseSchema(AdminTaskSchema) } }
        }
      }
    }
  },
  '/admin/tasks/{id}': {
    get: {
      summary: '管理任务详情',
      tags: [TagsMap.adminTasks],
      requestParams: { path: AdminIdPathSchema },
      responses: {
        200: {
          description: '任务详情',
          content: { 'application/json': { schema: AdminTaskSchema } }
        }
      }
    }
  },
  '/admin/tasks/action': {
    post: {
      summary: '重试失败的管理任务',
      tags: [TagsMap.adminTasks],
      requestBody: { content: { 'application/json': { schema: AdminTaskActionSchema } } },
      responses: { 200: { description: '重新提交成功' } }
    }
  },
  '/admin/audits': {
    get: {
      summary: '查询管理审计',
      tags: [TagsMap.adminAudits],
      requestParams: { query: AdminAuditListQuerySchema },
      responses: {
        200: {
          description: '审计列表',
          content: {
            'application/json': { schema: AdminPaginatedResponseSchema(AdminAuditSchema) }
          }
        }
      }
    }
  }
};
