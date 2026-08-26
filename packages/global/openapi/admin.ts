import { createDocument } from 'zod-openapi';
import { AdminCorePath } from './admin/core';
import { TagsMap } from './tag';
import { AdminSupportPath } from './admin/support';
import { AdminManagePath } from './admin/manage';

export const adminOpenAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT Admin API',
    version: '0.1.0',
    description: 'FastGPT Admin API 文档'
  },
  paths: {
    ...AdminCorePath,
    ...AdminSupportPath,
    ...AdminManagePath
  },
  servers: [{ url: '/api' }],
  'x-tagGroups': [
    {
      name: '仪表盘',
      tags: [TagsMap.adminDashboard]
    },
    {
      name: '核心资源管理',
      tags: [TagsMap.adminUsers, TagsMap.adminTeams, TagsMap.adminApps, TagsMap.adminDatasets]
    },
    {
      name: '系统记录',
      tags: [TagsMap.adminTasks, TagsMap.adminAudits]
    },
    {
      name: '系统配置',
      tags: [TagsMap.adminInform]
    }
  ]
});
