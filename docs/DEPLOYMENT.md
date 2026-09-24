# 部署指南

## GitHub 仓库

1. 在 GitHub 创建空仓库。
2. 不要让 GitHub 自动生成 README、License 或 `.gitignore`，本项目已经包含这些文件。
3. 将项目推送到 `main` 分支。
4. 在仓库设置中确认 Actions 已启用。

## 通用构建

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

项目会生成 Cloudflare Worker 兼容的构建产物。

## ChatGPT Sites

仓库中的 `.openai/hosting.example.json` 是示例配置。真实的 `project_id` 由 Sites 项目创建流程产生，不要复制其他项目的 ID。

## 环境变量

当前版本无需环境变量。未来接入视频、论文或 AI API 时：

- 只在托管平台配置密钥；
- 不要把 `.env` 文件提交到 GitHub；
- 保持客户端代码中不包含密钥；
- 通过服务端接口限制额度并验证输入。

## 发布版本

建议使用语义化版本，例如：

```bash
git tag -a v0.3.0 -m "Active Preview Map v0.3.0"
git push origin v0.3.0
```

随后在 GitHub Releases 中选择该标签，并粘贴对应版本的 Changelog 内容。
