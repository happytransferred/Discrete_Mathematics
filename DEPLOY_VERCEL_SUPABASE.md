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

Notes:

- If your database password contains `@`, use `%40` in the URL.
- The `homework-images` bucket must stay public for direct image display.
- Rotate the database password and service role key before formal launch if they were shared in chat or screenshots.

## 2. Supabase status

The project has already been prepared for deployment:

- PostgreSQL schema pushed with `prisma db push`
- Storage bucket `homework-images` exists
- The bucket has been set to public

## 3. Deploy

1. Push this project to GitHub, GitLab, or Bitbucket.
2. Import the repository into Vercel.
3. Add the environment variables above.
4. Deploy.

## 4. After deployment

1. Open the Vercel domain.
2. Register a teacher account.
3. Create a class and publish an assignment.
4. Register a student account and upload a homework image.
