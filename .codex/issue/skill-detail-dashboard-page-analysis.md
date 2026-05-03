# Skill 详情页进入后显示 FastGPT Dashboard 问题分析

## 现象

- 从 `Skill` 列表点击某个 skill 后，进入 `/skill/detail?skillId=...`
- 页面顶部已经切到 skill 详情页的头部操作区
- 但内容区域里显示的不是 skill 配置编辑器，而是一个 FastGPT 的 dashboard/agent 页面

## 代码链路

### 1. Skill 列表点击后确实跳到了详情页

文件: `projects/app/src/pageComponents/dashboard/skill/List.tsx`

```tsx
router.push(`/skill/detail?skillId=${skill._id}`);
```

说明:

- 这里不是跳回 `/dashboard/agent`
- 所以“看起来进入了 agent 页面”不是主路由跳错

### 2. Skill 详情页内容区实际是一个沙箱 iframe

文件: `projects/app/src/pages/skill/detail.tsx`

- 详情页挂载了：
  - `Header`
  - `Content`

文件: `projects/app/src/pageComponents/dashboard/skill/detail/Content.tsx`

- `config` tab 下会根据 sandbox 状态渲染：
  - `SkillBuilding`
  - `SandboxTerminal`
  - `SandboxIframe`
  - `SandboxError`

说明:

- Skill 详情页不是普通表单页
- 它的配置区域本质上是一个内嵌沙箱工作区

### 3. iframe 地址被写死为嵌套代理到 8080

文件: `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`

```tsx
<iframe src={`${sandboxEndpointUrl}proxy/8080/`} />
```

说明:

- `sandboxEndpointUrl` 先指向 sandbox 主入口
- 然后再追加 `proxy/8080/`
- 代码假设 sandbox 内的 `8080` 一定是 code-server

### 4. 后端创建 skill sandbox 时，默认镜像的预期行为就是启动 code-server

文件: `projects/agent-sandbox/entrypoint.sh`

```sh
exec code-server ... "${WORKDIR}"
```

文件: `projects/agent-sandbox/Dockerfile`

- 暴露端口 `8080`
- 镜像用途是 code-server 开发环境

说明:

- 正常情况下，iframe 里的内容应该是 code-server
- 不应该是 FastGPT dashboard

## 初步结论

当前问题不是“skill 详情页路由跳错了”，而是：

- `skill` 详情页内部嵌入的 sandbox iframe
- 访问 `${sandboxEndpointUrl}proxy/8080/` 时
- 实际命中了一个 FastGPT 页面，而不是 sandbox 内的 code-server

也就是说，异常更可能出在“沙箱 8080 代理目标”这一层，而不是前端页面切换本身。

## 高概率原因

### 原因 1: 当前 skill sandbox 使用的镜像不是预期的 agent-sandbox 镜像

相关代码:

文件: `packages/service/core/agentSkills/sandboxConfig.ts`

- 默认镜像来自：
  - `AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO`
  - `AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG`
- 默认值：
  - `fastgpt-agent-sandbox:latest`

如果线上实际配置的镜像不是这个，或者这个镜像被替换成了别的应用镜像，那么 8080 端口可能就不是 code-server。

### 原因 2: sandbox 外层代理正确，但内层 `/proxy/8080/` 指向了错误服务

相关代码:

- `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`
- `projects/app/server.ts`
- `projects/app/src/service/core/sandbox/proxy.ts`

说明:

- 外层先代理到 sandbox 主入口端口
- 再由主入口反代到容器 8080
- 如果 endpoint host、端口映射、server proxy 或 gateway 配置异常
- 8080 可能被转到了 FastGPT 自己的 web 服务

### 原因 2.1: 前端错误丢弃了 OpenSandbox 返回的 `endpoint.url` 路径信息

这是当前最可疑、也最像代码缺陷的点。

后端代码:

文件: `packages/service/core/agentSkills/sandboxConfig.ts`

```ts
return {
  host: endpoint.host,
  port: endpoint.port,
  protocol: endpoint.protocol,
  url: endpoint.url
};
```

说明:

- OpenSandbox 返回的 endpoint 不只有 `host/port`
- 还包含完整 `url`
- 后端等待服务 ready 时，用的也是 `endpoint.url`

文件: `packages/service/core/agentSkills/sandboxConfig.ts`

```ts
await fetch(endpoint.url, { method: 'HEAD' })
```

但前端代码:

文件: `projects/app/src/pageComponents/dashboard/skill/detail/context.tsx`

```ts
setSandboxEndpointUrl(`/proxy/${status.providerSandboxId}/${status.endpoint.port}/`);
```

文件: `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`

```tsx
src={`${sandboxEndpointUrl}proxy/8080/`}
```

说明:

- 前端没有使用后端返回的 `endpoint.url`
- 而是只拿了 `endpoint.port`
- 然后按 FastGPT 自己的 `/proxy/{sandboxId}/{port}/` 规则重新拼了一层路径

这在 `AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY=true` 场景下非常危险：

- OpenSandbox 很可能返回一个“带路径的 server proxy URL”
- 例如真正可访问入口可能是某种：
  - `http://host:8090/.../session/.../44772`
- 但前端把它粗暴改写成：
  - `/proxy/{sandboxId}/8090/`

这样会把 OpenSandbox 原本必须保留的代理路径丢掉。

一旦路径丢失，后续再拼 `/proxy/8080/` 时，就可能落到完全错误的服务上。

### 原因 3: OpenSandbox/网关层返回的 endpoint 信息异常

相关代码:

文件: `packages/service/core/agentSkills/sandboxController.ts`

- sandbox ready 时使用：
  - `getProviderSandboxEndpoint(client.provider, defaults.targetPort)`
- `defaults.targetPort` 是 `44772`

说明:

- 44772 是 sandbox 主入口
- 前端再基于它访问 `/proxy/8080/`
- 如果 `44772` 对应的 endpoint 本身就不是正确的 sandbox 网关，后续页面自然会错

## 当前能明确排除的点

- 不是 skill 卡片点击后主路由直接跳到 `/dashboard/agent`
- 不是 skill 详情页代码主动渲染了 agent 列表页
- 不是 navbar 的选中态导致的纯视觉问题

## 本次“嵌套重复显示”与截图现象的对应结论

### 现象重新解释

从截图看：

- 外层页面顶部已经是 skill 详情页自己的头部
  - 左上角 skill 名称
  - 中间 `Skill 配置 / 运行预览`
- 但下方内容区又出现了一整套 FastGPT 页面
  - 左侧主导航
  - 工作台侧边栏
  - `Agent` 列表

这说明当前问题不是 React 组件把列表页“渲染进了详情页”。

更准确地说：

- 外层是 `/skill/detail`
- 内层那套 FastGPT 页面，是 skill 详情页里的 `iframe` 加载出来的内容

### 对应代码证据

文件: `projects/app/src/pages/skill/detail.tsx`

- 这个页面只渲染了：
  - `Header`
  - `Content`

文件: `projects/app/src/pageComponents/dashboard/skill/detail/Content.tsx`

- `config` tab 下，`sandboxState === 'ready'` 时渲染：
  - `SandboxIframe`

文件: `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`

```tsx
<iframe src={`${sandboxEndpointUrl}proxy/8080/`} />
```

说明：

- skill 详情页下半部分本来就是一个 iframe
- 如果 iframe 指向错误地址，就会把“别的完整网页”嵌进来
- 截图里看到的“嵌套重复 FastGPT 页面”与这里完全吻合

## 为什么 iframe 会加载成 FastGPT 自己

### 1. 后端实际上返回了完整 endpoint.url

文件: `packages/service/core/agentSkills/sandboxConfig.ts`

```ts
return {
  host: endpoint.host,
  port: endpoint.port,
  protocol: endpoint.protocol,
  url: endpoint.url
};
```

说明：

- provider 返回的不是单纯 `host + port`
- 还包含完整可访问入口 `url`
- 这个 `url` 在 OpenSandbox 场景下很可能带有必须保留的路径前缀

### 2. SSE 类型里也明确带了 endpoint.url

文件: `packages/global/core/chat/type.ts`

```ts
endpoint?: {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url: string;
};
```

说明：

- 从类型设计上，前端本来就应该有能力直接使用完整 `url`

### 3. 但前端在 ready 时把 url 丢掉了

文件: `projects/app/src/pageComponents/dashboard/skill/detail/context.tsx`

```ts
if (status.phase === 'ready' && status.providerSandboxId && status.endpoint?.port) {
  setSandboxEndpointUrl(`/proxy/${status.providerSandboxId}/${status.endpoint.port}/`);
}
```

说明：

- 这里只用了：
  - `providerSandboxId`
  - `endpoint.port`
- 没有使用：
  - `endpoint.url`

也就是说，前端把 provider 返回的真实访问入口“重新手搓”成了：

```ts
/proxy/{providerSandboxId}/{endpoint.port}/
```

### 4. 后续 iframe 再继续追加 `/proxy/8080/`

文件: `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`

```tsx
src={`${sandboxEndpointUrl}proxy/8080/`}
```

最终访问路径会变成：

```txt
/proxy/{providerSandboxId}/{入口端口}/proxy/8080/
```

### 5. 服务端代理同样只认 host/protocol/port，不认 endpoint.url 的路径部分

文件: `projects/app/src/service/core/sandbox/proxy.ts`

```ts
const { host, protocol } = sandbox.metadata!.endpoint!;
return `${protocol}://${host}:${targetPort}`;
```

说明：

- 代理目标再次只用了 `host/protocol`
- 如果 provider 的真实入口依赖 `endpoint.url` 中的 path
- 那么这个 path 会在前后端两侧都被丢掉

## 这会如何导致“嵌套显示 FastGPT 页面”

当 `endpoint.url` 里的关键路径被丢掉后，访问会退化成：

- 命中错误的网关根路径
- 命中默认 upstream
- 或命中当前站点自己的 Web 服务

一旦这个错误目标刚好返回的是 FastGPT 主站页面，就会出现：

- 外层是 skill detail
- 内层 iframe 又打开了 FastGPT 工作台

也就是你截图里的“页面嵌套重复显示”。

## 本次排查结论

本次问题的根因高度怀疑是：

- Skill 详情页的沙箱预览不是直接使用 provider 返回的 `endpoint.url`
- 而是前端与服务端都只取了 `host/port`
- 再自行拼接 `/proxy/.../proxy/8080/`
- 导致 OpenSandbox 真实入口路径丢失
- 最终 iframe 打开了错误页面，表现为嵌套重复显示 FastGPT

## 新增运行时证据

用户在：

文件: `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`

增加日志：

```ts
console.log('SandboxIframe>>>>>>>>', sandboxEndpointUrl);
```

实际输出为：

```txt
SandboxIframe>>>>>>>> /proxy/69f2d364a401eed750daac0b/8090/
```

这说明：

- 前端当前实际使用的不是 provider 返回的完整 `endpoint.url`
- 而是已经被重写过的一段本地 path-based proxy 前缀

结合 `SandboxIframe.tsx` 中的这段代码：

```tsx
src={`${sandboxEndpointUrl}proxy/8080/`}
```

最终 iframe 实际访问的是：

```txt
/proxy/69f2d364a401eed750daac0b/8090/proxy/8080/
```

这与前面的怀疑完全一致：

- 第一层 `/proxy/{sandboxId}/8090/` 是 FastGPT 本地代理入口
- 第二层 `/proxy/8080/` 是希望远端 8090 服务继续反代到容器内 code-server
- 只要第一层入口不是 provider 返回的真实完整路径，或者远端 8090 不是预期的 sandbox gateway
- iframe 就会落到错误页面

### ready 事件完整返回值

用户继续打印：

```ts
console.log('status==============', JSON.stringify(status));
```

输出为：

```json
{
  "sandboxId": "69f2183cd1cfd90f30273210",
  "phase": "ready",
  "endpoint": {
    "host": "10.5.10.49",
    "port": 8090,
    "protocol": "http",
    "url": "http://10.5.10.49:8090/sandboxes/48999f20-2cf5-40fc-af71-e7333be60363/proxy/44772"
  },
  "providerSandboxId": "69f2d364a401eed750daac0b"
}
```

### 这条日志说明了什么

这已经可以确认：

1. provider 返回的真实入口不是简单的 `http://10.5.10.49:8090`
2. 它依赖一段必须保留的路径：

```txt
/sandboxes/48999f20-2cf5-40fc-af71-e7333be60363/proxy/44772
```

3. 当前前端却把这个完整地址错误地降级成了：

```txt
/proxy/69f2d364a401eed750daac0b/8090/
```

也就是：

- 把 `endpoint.url` 里的真实路径前缀完全丢掉了
- 用 `providerSandboxId + endpoint.port` 重新手工拼了一条本地代理地址

### 根因确认

现在可以明确：

- 问题根因不是 React 页面嵌套
- 不是 skill detail 页面路由跳错
- 而是 `endpoint.url` 中的 OpenSandbox 路径前缀被前端和代理链路丢失了

真实可达入口应当围绕：

```txt
http://10.5.10.49:8090/sandboxes/48999f20-2cf5-40fc-af71-e7333be60363/proxy/44772
```

而当前实际访问却围绕：

```txt
/proxy/69f2d364a401eed750daac0b/8090/
```

这两者不是同一个地址语义。

前者是：

- OpenSandbox 返回的真实网关入口
- 带有 provider 自己分配的 sandbox path

后者是：

- FastGPT 按 `sandboxId + port` 自行重建出来的 path-based proxy

因此只要 OpenSandbox 的入口依赖 path，当前实现就一定会错。

## 最终结论

本问题已经可以定性为：

- `projects/app/src/pageComponents/dashboard/skill/detail/context.tsx`
  在 `ready` 时错误忽略了 `status.endpoint.url`
- `projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxIframe.tsx`
  又在错误入口上继续拼接 `/proxy/8080/`
- `projects/app/src/service/core/sandbox/proxy.ts`
  代理目标解析同样只保留 `host/protocol/port`

三者叠加后，导致 OpenSandbox 的真实入口路径丢失，最终 iframe 打开了错误页面，表现为“Skill 详情页嵌套重复显示 FastGPT 页面”。

## 建议的下一步修复方向

如果要继续修，优先级建议如下：

1. 先把 `ready` 阶段返回的 `status.endpoint.url` 打印出来，与当前 `sandboxEndpointUrl` 对比。
2. 明确 OpenSandbox 返回的入口是否包含 path 前缀。
3. 如果包含 path，不要再只按 `providerSandboxId + port` 重拼地址。
4. 同步检查 `projects/app/src/service/core/sandbox/proxy.ts`，确认代理目标是否也要保留完整 URL/path。

当前这一步先能明确结论：

- 不是普通页面嵌套路由问题
- 是 skill detail 内部 iframe 的目标地址拼错了

## 新增排查结果

### 1. 当前本地 FastGPT 的 skill 功能连的是远程 OpenSandbox

文件: `projects/app/.env.local`

- `SHOW_SKILL=true`
- `AGENT_SANDBOX_PROVIDER=opensandbox`
- `AGENT_SANDBOX_OPENSANDBOX_BASEURL=http://192.254.90.4:8090`
- `AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-sandbox`
- `AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG=v0.1`

说明:

- 你本地 FastGPT 不是使用本地 sandbox
- 而是通过远程 OpenSandbox 拉起 skill 编辑沙箱

### 2. 远程 8090 是可达的 OpenSandbox 服务

本机验证结果:

- `curl -I http://192.254.90.4:8090/health`
- 返回:
  - `HTTP/1.1 405 Method Not Allowed`
  - `server: uvicorn`
  - `allow: GET`

说明:

- `8090` 对应的是一个 Uvicorn 服务
- 与 OpenSandbox server 预期一致

### 3. 远程主机的裸 `8080` 不是 FastGPT dashboard

本机验证结果:

- `curl -I http://192.254.90.4:8080`
- 返回:
  - `HTTP/1.1 401 Unauthorized`
  - `server: uvicorn`

说明:

- 远程主机本身的 `8080` 并不是一个直接可见的 FastGPT dashboard
- 所以问题更不像是“远程主机 8080 本来就是 dashboard”
- 更像是“前端/代理把 sandbox endpoint 拼错了，打到了错误的 OpenSandbox server proxy 路径”

## 建议排查顺序

1. 优先修正前端对 sandbox endpoint 的使用方式，不要丢弃 `endpoint.url`
2. 在浏览器里直接查看 iframe 最终请求 URL，确认当前是不是错误地访问成了 `/proxy/{sandboxId}/8090/proxy/8080/`
3. 检查运行环境中的 `AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO/TAG`
4. 确认当前实际拉起的镜像是否就是 `projects/agent-sandbox` 构建出来的镜像
5. 如仍异常，再确认容器内 `8080` 当前监听的到底是不是 `code-server`

## 如果要修

优先方向不是改 skill 页面路由，而是：

- 修复前端对 OpenSandbox endpoint 的消费方式
- 不要把 `endpoint.url` 降级成仅 `port`
- 必要时把 `SandboxIframe.tsx` 中对 `/proxy/8080/` 的拼接逻辑改成基于真实 endpoint/path 的方式
