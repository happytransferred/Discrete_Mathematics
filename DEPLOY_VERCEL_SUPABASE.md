# Vercel + Supabase Deployment

## 1. Vercel environment variables

Add these variables in your Vercel project settings:

```text
DATABASE_URL=postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@db.cuoaoyjlctfphhxiwssy.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@db.cuoaoyjlctfphhxiwssy.supabase.co:5432/postgres
JWT_SECRET=replace_with_a_long_random_secret
SUPABASE_URL=https://cuoaoyjlctfphhxiwssy.supabase.co
SUPABASE_ANON_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=homework-images
```

## 2. AI grading variables

You can choose one provider and configure it by environment variables.

### Option A: OpenAI

```text
AI_PROVIDER=openai
AI_API_KEY=your_openai_api_key
AI_MODEL=gpt-5.2
```

### Option B: DeepSeek

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
AI_MODEL=deepseek-chat
```

### Option C: Kimi / Moonshot

```text
AI_PROVIDER=kimi
KIMI_API_KEY=your_kimi_api_key
AI_MODEL=kimi-k2.5
```

You can also use the generic form:

```text
AI_PROVIDER=deepseek_or_kimi_or_openai
AI_API_KEY=your_provider_api_key
AI_MODEL=your_model_name
AI_BASE_URL=optional_custom_base_url
```

## 3. Notes

- If your database password contains `@`, use `%40` in the URL.
- The `homework-images` bucket must stay public for direct image display.
- Rotate the database password and service role key before formal launch if they were shared in chat or screenshots.
- DeepSeek is integrated through its OpenAI-compatible API path.
- Kimi is integrated through Moonshot's API path.

## 4. Supabase status

The project has already been prepared for deployment:

- PostgreSQL schema pushed with `prisma db push`
- Storage bucket `homework-images` exists
- The bucket has been set to public

## 5. Deploy

1. Push this project to GitHub, GitLab, or Bitbucket.
2. Import the repository into Vercel.
3. Add the environment variables above.
4. Deploy.

## 6. After deployment

1. Open the Vercel domain.
2. Register a teacher account.
3. Create a class and publish an assignment.
4. Register a student account and submit text or image answers.
5. Verify that the teacher can review AI scores and override them manually.
