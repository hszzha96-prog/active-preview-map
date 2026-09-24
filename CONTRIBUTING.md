# 贡献指南

感谢你改进主动预习地图。

## 开始之前

1. 从 `main` 创建功能分支。
2. 一个 Pull Request 尽量只解决一个明确问题。
3. 不要提交课程原件、个人信息、API 密钥或构建缓存。

## 开发流程

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

修改完成后运行：

```bash
pnpm lint
pnpm build
```

## 提交建议

- `feat:` 新功能
- `fix:` 修复问题
- `docs:` 文档更新
- `style:` 视觉或样式调整
- `refactor:` 不改变功能的代码重构
- `chore:` 工程配置或依赖维护

示例：

```text
feat: add saved learning resources
```

## Pull Request

请说明：

- 修改解决了什么问题；
- 用户如何使用；
- 如何测试；
- 是否影响文件隐私、外部跳转或导出结果。
