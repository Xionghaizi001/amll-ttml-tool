# GitHub PAT 申请指引

## 1. 打开 Token 创建页面
- 打开 https://github.com/settings/tokens
- 推荐使用 “Fine-grained tokens”，也可以使用 “Tokens (classic)”

## 2. 选择权限范围
- Fine-grained：
  - Repository access 选择 all
  - Permissions 至少包含 Repository metadata（Read）、 Pull requests（Read）与 gist

请注意，若你选择了 Fine-grained tokens ，那么你将无法使用编辑器内置的一键更新投稿功能。

- Classic：
  - 选择 repo、read:org、gist、user
    - 若你觉得 repo 的权限还是太大了，也可以选择 public_repo

## 3. 生成并复制
- 设置有效期与说明
- 点击生成后复制 Token

## 4. 粘贴到应用
- 将 Token 粘贴到 “GitHub PAT” 输入框
- 点击“验证”完成登录

## 注意
- 不要将 PAT 分享给他人
- 如果泄露，请在 GitHub 中立即撤销并重新生成
