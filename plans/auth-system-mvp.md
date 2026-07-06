# FigColor 用户认证系统 MVP 架构设计 (修订版)

## 1. 概述

### 1.1 目标
实现 Email + Password 登录注册系统 MVP，为未来扩展微信登录、邮箱验证、找回密码预留接口和数据模型空间。

### 1.2 实现范围 (本轮)
- 后端 only
- 不改前端 UI (除非必须修复接口编译错误)
- 最终验收见第 8 节

## 2. 数据库设计

### 2.1 users 表
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  name VARCHAR(255),
  avatar_url TEXT,
  password_hash VARCHAR(255),          -- bcrypt 加密存储
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, suspended
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

### 2.2 auth_providers 表 (为微信等多 provider 预留)
```sql
CREATE TABLE auth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,        -- 'email', 'wechat', 'google', etc.
  provider_user_id VARCHAR(255),       -- 第三方平台用户ID
  openid VARCHAR(255),                  -- 微信 openid
  unionid VARCHAR(255),                 -- 微信 unionid
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id),
  UNIQUE(provider, openid)
);
CREATE INDEX idx_auth_providers_user_id ON auth_providers(user_id);
CREATE INDEX idx_auth_providers_provider ON auth_providers(provider);
```

### 2.3 favorite_palettes 表
```sql
CREATE TABLE favorite_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  palette_id VARCHAR(255) NOT NULL,    -- 来自 palettes.json 的 palette id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, palette_id)
);
CREATE INDEX idx_favorite_palettes_user_id ON favorite_palettes(user_id);
```

### 2.4 修改 paper_projects 表
```sql
-- 由于需要保留旧数据，先添加 nullable 列，再迁移数据，最后改为 NOT NULL
ALTER TABLE paper_projects ADD COLUMN user_id UUID;
UPDATE paper_projects SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
ALTER TABLE paper_projects ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE paper_projects ADD CONSTRAINT fk_paper_projects_user FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_paper_projects_user_id ON paper_projects(user_id);
```

## 3. API 设计

### 3.1 Auth 模块

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | 用户注册 |
| POST | /api/auth/login | No | 用户登录 |
| POST | /api/auth/logout | Yes | 用户登出 |
| GET | /api/auth/me | Yes | 获取当前用户信息 |

**预留接口 (框架存在但功能待实现)**:
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/verify-email | Yes | 验证邮箱 |
| POST | /api/auth/resend-verification-email | Yes | 重新发送验证邮件 |
| POST | /api/auth/forgot-password | No | 忘记密码 |
| POST | /api/auth/reset-password | No | 重置密码 |
| GET | /api/auth/wechat/login | No | 微信登录发起 |
| GET | /api/auth/wechat/callback | No | 微信回调 |
| POST | /api/auth/wechat/bind | Yes | 绑定微信账号 |
| POST | /api/auth/wechat/unbind | Yes | 解绑微信账号 |

### 3.2 Favorites 模块

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/me/favorites | Yes | 获取当前用户收藏列表 |
| POST | /api/me/favorites/:paletteId | Yes | 收藏一个 palette |
| DELETE | /api/me/favorites/:paletteId | Yes | 取消收藏 |

### 3.3 Projects 模块 (统一 /api/me/projects 前缀)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/me/projects | Yes | 获取当前用户的 projects |
| POST | /api/me/projects | Yes | 创建 project |
| GET | /api/me/projects/:projectId | Yes | 获取 project 详情 (需校验用户权限) |
| PATCH | /api/me/projects/:projectId | Yes | 更新 project (需校验用户权限) |
| DELETE | /api/me/projects/:projectId | Yes | 删除 project (需校验用户权限) |

### 3.4 User 模块

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/users/me | Yes | 获取当前用户详情 |
| PATCH | /api/users/me | Yes | 更新当前用户信息 |

### 3.5 请求/响应格式

#### POST /api/auth/register
```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"  // optional
}

// Response (201)
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false,
    "avatarUrl": null,
    "status": "active"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### POST /api/auth/login
```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

// Response (200)
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true,
    "avatarUrl": "https://...",
    "status": "active"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

## 4. JWT 设计

### 4.1 Token 结构
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "iat": 1704067200,
  "exp": 1704153600
}
```

### 4.2 Token 配置
- 算法: HS256
- 过期时间: 24 小时
- 存储: localStorage (MVP 阶段)，结构支持未来切换到 HttpOnly Cookie

## 5. 后端模块结构

```
backend/
├── internal/
│   ├── auth/
│   │   ├── handler.go      # Auth HTTP handlers
│   │   ├── service.go      # Auth business logic
│   │   ├── repository.go   # Auth data access
│   │   └── model.go        # Auth-related models
│   ├── user/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── repository.go
│   │   └── model.go
│   ├── favorite/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── repository.go
│   │   └── model.go
│   ├── project/
│   │   └── (已有，改动用户隔离)
│   ├── middleware/
│   │   ├── auth.go         # JWT 解析中间件
│   │   └── cors.go         # CORS 中间件
│   └── config/
│       └── config.go
├── migrations/
│   ├── 003_create_users.sql
│   ├── 004_create_auth_providers.sql
│   ├── 005_create_favorite_palettes.sql
│   └── 006_add_user_id_to_paper_projects.sql
└── cmd/server/
    └── main.go
```

## 6. 安全要求

1. **密码加密**: 使用 bcrypt (cost factor: 12)
2. **输入校验**:
   - email: 有效邮箱格式
   - password: 最小 8 字符，包含字母和数字
3. **用户数据隔离**: 所有 /api/me/* 接口从 JWT 获取 currentUser
4. **Project 权限**: 校验 user_id 匹配

## 7. 实现顺序

1. 数据库迁移 (003-006)
2. User 模块 (model, repository, service, handler)
3. Auth 模块 (model, repository, service, handler)
4. JWT Middleware
5. Favorite 模块
6. Project 模块用户隔离改造
7. 更新 main.go 注册新路由

## 8. 验收标准

- [ ] go build 无错误
- [ ] 用户可以注册和登录
- [ ] 登录后 GET /api/auth/me 返回当前用户
- [ ] 未登录访问 /api/me/favorites 和 /api/me/projects 返回 401
- [ ] User A 无法访问 User B 的 project
- [ ] 收藏同一个 palette 不会重复插入
- [ ] 删除收藏后 GET /api/me/favorites 不再返回该 palette
- [ ] 所有个人数据查询都带 currentUser.ID 条件