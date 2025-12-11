# Deploy CuraLink Backend to Railway

## Prerequisites
- GitHub account
- Railway account (https://railway.app)

## Steps

### 1. Push Code to GitHub
```bash
git add .
git commit -m "Production ready CuraLink backend"
git push origin main
```

### 2. Deploy on Railway
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `curalink-backend` repository
5. Railway will auto-detect Node.js

### 3. Add Environment Variables
In Railway dashboard:
- Go to your project → Variables
- Add all variables from `.env.production.example`
- **Important**: Generate new JWT secrets!

### 4. Add Start Command
In Railway settings:
- Start Command: `npm start`
- Build Command: `npm install && npx prisma generate`

### 5. Enable PostgreSQL (if needed)
- Railway can provide PostgreSQL
- Or use your existing Supabase connection

### 6. Deploy!
- Railway will automatically deploy
- You'll get a URL like: `https://curalink-backend-production.up.railway.app`

## Post-Deployment
- Test all endpoints
- Update CORS `FRONTEND_URL` in Railway variables
- Setup custom domain (optional)
