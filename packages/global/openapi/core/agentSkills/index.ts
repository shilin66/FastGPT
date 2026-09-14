import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  AppsBySkillIdItemSchema,
  CreateEditDebugSandboxBodySchema,
  CreateEditDebugSandboxResponseSchema,
  CreateSkillBodySchema,
  CreateSkillFolderBodySchema,
  CreateSkillFolderResponseSchema,
  CreateSkillResponseSchema,
  DeleteSkillQuerySchema,
  DeleteSkillVersionBodySchema,
  ExportSkillQuerySchema,
  GetSkillDetailQuerySchema,
  GetSkillDetailResponseSchema,
  GetSkillFolderPathQuerySchema,
  GetSkillFolderPathResponseSchema,
  ImportSkillMultipartRequestSchema,
  ImportSkillResponseSchema,
  ListAppsBySkillIdQuerySchema,
  ListSkillVersionsBodySchema,
  ListSkillVersionsResponseSchema,
  ListSkillsQuerySchema,
  ListSkillsResponseSchema,
  SaveDeploySkillBodySchema,
  SaveDeploySkillResponseSchema,
  ResetSkillWorkspaceBodySchema,
  ResetSkillWorkspaceResponseSchema,
  RetryInitializeSkillBodySchema,
  RetryInitializeSkillResponseSchema,
  SkillDebugChatBodySchema,
  SkillDebugRecordsBodySchema,
  SkillDebugRecordsResponseSchema,
  SkillDebugSessionDeleteBodySchema,
  SkillDebugSessionListQuerySchema,
  SkillDebugSessionListResponseSchema,
  SwitchSkillVersionBodySchema,
  UpdateSkillBodySchema,
  UpdateSkillVersionBodySchema
} from './api';

export const AgentSkillsPath: OpenAPIPath = {
  '/core/agentSkills/list': {
    post: {
      summary: '获取技能列表',
      description: '分页获取当前团队可见的系统技能或个人技能',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: ListSkillsQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回技能列表',
          content: {
            'application/json': {
              schema: ListSkillsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/detail': {
    get: {
      summary: '获取技能详情',
      description: '根据 skillId 获取技能详情',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: GetSkillDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回技能详情',
          content: {
            'application/json': {
              schema: GetSkillDetailResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/create': {
    post: {
      summary: '创建技能',
      description: '创建一个新的技能，可选使用 AI 根据 requirements 生成 SKILL.md',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateSkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建技能',
          content: {
            'application/json': {
              schema: CreateSkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/update': {
    post: {
      summary: '更新技能',
      description: '更新技能名称、描述、分类和配置',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新技能'
        }
      }
    }
  },
  '/core/agentSkills/delete': {
    delete: {
      summary: '删除技能',
      description: '根据 skillId 删除技能',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: DeleteSkillQuerySchema
      },
      responses: {
        200: {
          description: '成功删除技能'
        }
      }
    }
  },
  '/core/agentSkills/import': {
    post: {
      summary: '导入技能',
      description:
        '上传 ZIP 技能包，安全校验后过滤 __MACOSX/、.DS_Store 和 ._* 附加文件并导入。校验失败返回具体的本地化提示键。',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: ImportSkillMultipartRequestSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导入技能',
          content: {
            'application/json': {
              schema: ImportSkillResponseSchema
            }
          }
        },
        400: {
          description:
            '技能包校验失败，保留 invalidSkillPackage 业务错误码，message 为具体校验原因的本地化键'
        }
      }
    }
  },
  '/core/agentSkills/export': {
    get: {
      summary: '导出技能',
      description: '下载技能 ZIP 包',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: ExportSkillQuerySchema
      },
      responses: {
        200: {
          description: '返回技能 zip 文件',
          content: {
            'application/zip': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/apps': {
    get: {
      summary: '查询引用技能的应用',
      description: '查询使用指定 skillId 的应用列表',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: ListAppsBySkillIdQuerySchema
      },
      responses: {
        200: {
          description: '成功返回引用应用列表',
          content: {
            'application/json': {
              schema: AppsBySkillIdItemSchema.array()
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/folder/create': {
    post: {
      summary: '创建技能文件夹',
      description: '在技能目录树中创建一个文件夹',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateSkillFolderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建文件夹',
          content: {
            'application/json': {
              schema: CreateSkillFolderResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/folder/path': {
    get: {
      summary: '获取技能文件夹路径',
      description: '根据当前 skillId 返回目录路径',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: GetSkillFolderPathQuerySchema
      },
      responses: {
        200: {
          description: '成功返回目录路径',
          content: {
            'application/json': {
              schema: GetSkillFolderPathResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/edit': {
    post: {
      summary: '创建编辑调试沙盒',
      description: '为技能创建 edit-debug 沙盒，返回 SSE sandboxStatus 事件流',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateEditDebugSandboxBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream 事件流',
          content: {
            'text/event-stream': {
              schema: CreateEditDebugSandboxResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/save-deploy': {
    post: {
      summary: '保存并发布技能',
      description: '从 edit-debug 沙盒打包当前技能并创建新版本',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: SaveDeploySkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功保存并发布技能',
          content: {
            'application/json': {
              schema: SaveDeploySkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/reset-workspace': {
    post: {
      summary: '重置技能编辑工作区',
      description:
        '需要管理权限和明确确认丢弃草稿；核对当前版本、工作区基线及操作 ID 后，将可验证的持久工作区重置到当前版本。未知远端失败不会自动重试。',
      tags: [TagsMap.aiSkill],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ResetSkillWorkspaceBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '工作区已重置并返回新代次状态',
          content: {
            'application/json': {
              schema: ResetSkillWorkspaceResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/retry-initialize': {
    post: {
      summary: '重试初始化 Skill',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: RetryInitializeSkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '初始化任务已重新提交',
          content: {
            'application/json': {
              schema: RetryInitializeSkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/debugChat': {
    post: {
      summary: '技能调试对话',
      description: '基于 edit-debug 沙盒发起技能调试对话，返回 SSE 流',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillDebugChatBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream 调试事件流',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string'
              }
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/debugSession/list': {
    get: {
      summary: '获取技能调试会话列表',
      description: '分页获取技能的调试会话',
      tags: [TagsMap.aiSkill],
      requestParams: {
        query: SkillDebugSessionListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回调试会话列表',
          content: {
            'application/json': {
              schema: SkillDebugSessionListResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/debugSession/delete': {
    post: {
      summary: '删除技能调试会话',
      description: '软删除一个技能调试会话',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillDebugSessionDeleteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除调试会话'
        }
      }
    }
  },
  '/core/agentSkills/debugSession/records': {
    post: {
      summary: '获取技能调试会话记录',
      description: '分页获取技能调试会话的聊天记录',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillDebugRecordsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回调试记录',
          content: {
            'application/json': {
              schema: SkillDebugRecordsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/version/list': {
    post: {
      summary: '获取技能版本列表',
      description: '分页获取指定技能的版本列表，按版本号倒序排列',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: ListSkillVersionsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回版本列表',
          content: {
            'application/json': {
              schema: ListSkillVersionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/agentSkills/version/update': {
    post: {
      summary: '更新技能版本名称',
      description: '更新指定技能版本的名称',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSkillVersionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新版本名称'
        }
      }
    }
  },
  '/core/agentSkills/version/switch': {
    post: {
      summary: '切换技能活跃版本',
      description: '重新校验目标包后，以比较并交换方式更新当前版本指针',
      tags: [TagsMap.aiSkill],
      requestBody: {
        content: {
          'application/json': {
            schema: SwitchSkillVersionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功切换当前版本'
        }
      }
    }
  },
  '/core/agentSkills/version/delete': {
    post: {
      summary: '删除 Skill 历史版本',
      description: '当前版本不可删除；历史版本软删除后保留 30 天，再清理对象存储',
      tags: [TagsMap.aiSkill],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: DeleteSkillVersionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '版本已进入软删除保留期'
        }
      }
    }
  }
};
