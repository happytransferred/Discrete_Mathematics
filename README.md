# 离散数学课程智能作业平台 MVP

基于 `Next.js + TypeScript + Tailwind CSS + Prisma + SQLite` 的本地 MVP。

已实现：
- 注册/登录（教师/学生角色）
- 教师创建班级（自动生成班级码）
- 学生通过班级码加入班级
- 教师发布作业
- 学生上传作业图片（本地 `uploads/` 存储）
- 系统返回 mock 批改结果（JSON 结构）
- 学生查看个人批改结果，教师查看全班提交记录

## 1. 项目目录结构

```text
.
├─ prisma/
│  └─ schema.prisma
├─ uploads/
│  └─ .gitkeep
├─ src/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ assignments/
│  │  │  │  ├─ [id]/route.ts
│  │  │  │  └─ route.ts
│  │  │  ├─ auth/
│  │  │  │  ├─ login/route.ts
│  │  │  │  ├─ logout/route.ts
│  │  │  │  ├─ me/route.ts
│  │  │  │  └─ register/route.ts
│  │  │  ├─ classes/
│  │  │  │  ├─ [id]/route.ts
│  │  │  │  ├─ join/route.ts
│  │  │  │  └─ route.ts
│  │  │  ├─ submissions/route.ts
│  │  │  └─ uploads/[...path]/route.ts
│  │  ├─ assignments/[id]/page.tsx
│  │  ├─ classes/[id]/page.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ login/page.tsx
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ lib/
│  │  ├─ auth.ts
│  │  ├─ class-code.ts
│  │  └─ prisma.ts
│  ├─ services/
│  │  └─ grading-service.ts
│  └─ types/
│     └─ grading.ts
├─ .env.example
├─ package.json
└─ README.md
```

## 2. 数据库 Schema（Prisma）

核心模型：
- `User`：用户（教师/学生）
- `Class`：班级
- `ClassMember`：班级-学生关联
- `Assignment`：作业
- `Submission`：提交记录（含图片路径和 JSON 批改结果）

详见：`prisma/schema.prisma`

## 3. API 路由

鉴权：
- `POST /api/auth/register` 注册并登录
- `POST /api/auth/login` 登录
- `POST /api/auth/logout` 登出
- `GET /api/auth/me` 当前用户

班级：
- `GET /api/classes` 获取我的班级
- `POST /api/classes` 教师创建班级
- `POST /api/classes/join` 学生通过班级码加入
- `GET /api/classes/:id` 班级详情

作业：
- `GET /api/assignments?classId=...` 获取班级作业
- `POST /api/assignments` 教师发布作业
- `GET /api/assignments/:id` 作业详情

提交与批改：
- `POST /api/submissions` 学生上传图片并触发 mock 批改
- `GET /api/submissions?assignmentId=...` 查询提交
  - 学生：返回本人提交
  - 教师：返回全班提交列表

图片访问：
- `GET /api/uploads/:path` 读取 `uploads/` 下图片

## 4. 批改结果 JSON 结构

`src/types/grading.ts`:

```ts
export type GradingResult = {
  overallScore: number;
  maxScore: number;
  summary: string;
  checks: Array<{
    item: string;
    score: number;
    maxScore: number;
    comment: string;
  }>;
  suggestions: string[];
};
```

当前 mock 实现：`src/services/grading-service.ts`

后续接入真实大模型时，只需要替换 `gradeHomework()` 内部逻辑，保持返回结构一致即可。

## 5. 本地运行步骤

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

3. 初始化数据库并生成 Prisma Client

```bash
npx prisma migrate dev --name init
```

4. 启动开发环境

```bash
npm run dev
```

5. 打开浏览器

```text
http://localhost:3000
```

## 6. MVP 说明

- 鉴权采用 `HttpOnly Cookie + JWT`。
- 图片存储在本地 `uploads/`，适合本地开发与演示。
- 允许学生对同一作业重复提交，系统会覆盖旧提交并重新批改。
- 旧的 `index.html / app.js / styles.css` 是历史文件，不参与本 MVP 运行。
