# PDF解析器配置说明

## 概述

系统现在支持配置多个PDF解析器，用户可以在创建知识库和聊天文件设置中选择不同的PDF解析器。

## 配置结构

在系统配置中，`customPdfParse` 现在是一个数组类型，每个解析器包含以下字段：

```json
{
  "systemEnv": {
    "customPdfParse": [
      {
        "name": "解析器名称",
        "desc": "解析器描述",
        "url": "解析器API地址（可选）",
        "key": "API密钥（可选）",
        "doc2xKey": "Doc2x API密钥（可选）",
        "price": "每页价格",
        "extension": "支持的文件扩展名，用逗号分隔"
      }
    ]
  }
}
```

## 字段说明

- `name`: 解析器的唯一标识名称，用于在前端选择器中显示
- `desc`: 解析器的描述信息，帮助用户了解解析器的特点
- `url`: 自定义解析器的API地址（与doc2xKey二选一）
- `key`: 自定义解析器的API密钥
- `doc2xKey`: Doc2x服务的API密钥（与url二选一）
- `price`: 每页解析的积分价格
- `extension`: 支持的文件扩展名，多个扩展名用逗号分隔

## 配置示例

```json
{
  "systemEnv": {
    "customPdfParse": [
      {
        "name": "marker",
        "desc": "Marker PDF解析器，基于视觉解析，可以有效提取图片、表格、公式等复杂内容",
        "url": "http://localhost:8080/parse",
        "key": "your-api-key",
        "price": 2,
        "extension": "pdf"
      },
      {
        "name": "doc2x",
        "desc": "Doc2x PDF解析器，支持多种文档格式",
        "doc2xKey": "your-doc2x-api-key",
        "price": 1,
        "extension": "pdf,docx,pptx,xlsx"
      },
      {
        "name": "mineru",
        "desc": "MinerU解析器，专业的学术文档解析工具",
        "url": "http://localhost:8081/parse",
        "key": "mineru-api-key",
        "price": 3,
        "extension": "pdf,tex,md"
      }
    ]
  }
}
```

## 前端变化

1. **知识库创建页面**: 在训练参数设置中，PDF增强解析从复选框改为下拉选择器
2. **聊天文件设置**: 在应用配置的文件上传设置中，PDF增强解析也改为下拉选择器
3. **价格显示**: 根据选择的解析器动态显示对应的价格

## 数据库变化

- `customPdfParse` 字段从 `Boolean` 类型改为 `String` 类型，存储选中的解析器名称
- 空字符串表示使用系统默认解析器

## API变化

- 新增 `/api/system/getPdfParsers` 接口，用于获取可用的PDF解析器列表
- 新增 `/api/admin/migratePdfParseConfig` 接口，用于将现有数据从boolean类型迁移到string类型
- 所有涉及 `customPdfParse` 参数的API，参数类型从 `boolean` 改为 `string`

### 数据迁移API

**接口地址**: `POST /api/admin/migratePdfParseConfig`

**权限要求**: 管理员权限

**请求参数**:
```json
{
  "defaultParser": "mineru"  // 可选，默认为系统配置中第一个解析器的名称
}
```

**响应格式**:
```json
{
  "success": true,
  "message": "PDF解析配置迁移完成",
  "data": {
    "datasetCollections": {
      "trueToParser": 5,    // 从true转换为解析器名称的记录数
      "falseToEmpty": 10    // 从false转换为空字符串的记录数
    },
    "apps": {
      "updated": 3,         // 更新的应用数量
      "details": [          // 详细的更新信息
        {
          "appId": "64f1a2b3c4d5e6f7g8h9i0j1",
          "oldValue": true,
          "newValue": "mineru"
        }
      ]
    }
  }
}
```

**使用说明**:
- 该接口会自动将数据库中所有boolean类型的 `customPdfParse` 字段迁移为string类型
- `true` 值会转换为指定的解析器名称（默认为系统配置中第一个解析器）
- `false` 值会转换为空字符串（表示使用系统默认解析器）
- 迁移过程是幂等的，可以安全地多次执行

## 向后兼容性

- 如果配置中没有 `customPdfParse` 数组或数组为空，系统将不显示PDF解析器选择器
- 现有的数据库记录中的 `customPdfParse` 字段需要进行数据迁移