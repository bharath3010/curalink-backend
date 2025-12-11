# 🚀 CuraLink Backend Deployment Checklist

## Before Deployment

### Security
- [ ] All JWT secrets are strong random strings (min 64 chars)
- [ ] Database credentials are secure
- [ ] API keys are not hardcoded
- [ ] `.env` file is in `.gitignore`
- [ ] CORS is configured with specific origins (not `*`)
- [ ] Rate limiting is enabled
- [ ] Helmet security headers are enabled

### Database
- [ ] Supabase project is on paid tier (for production)
- [ ] Database connection uses pooler (port 6543)
- [ ] All migrations are applied
- [ ] Prisma schema is generated

### External Services
- [ ] Cloudinary account created and configured
- [ ] PayPal sandbox tested, production keys ready
- [ ] Email SMTP configured (SendGrid/Gmail)
- [ ] Cohere API key obtained (if using AI features)

### Code Quality
- [ ] All endpoints tested locally
- [ ] Error handling is comprehensive
- [ ] Logging is configured
- [ ] No console.log in production code
- [ ] All dependencies are up to date

## After Deployment

### Verification
- [ ] Health check endpoint responds: `GET /_health`
- [ ] Root endpoint shows API info: `GET /`
- [ ] Auth endpoints work (register, login)
- [ ] Protected endpoints require authentication
- [ ] Database queries work correctly

### Monitoring
- [ ] Check application logs
- [ ] Monitor error rates
- [ ] Check API response times
- [ ] Verify database connection pool

### Frontend Integration
- [ ] Update frontend API base URL
- [ ] Test CORS from frontend domain
- [ ] Verify cookies work cross-domain
- [ ] Test full user flows

## Production Maintenance

### Regular Tasks
- [ ] Monitor Supabase usage and costs
- [ ] Review error logs weekly
- [ ] Update dependencies monthly
- [ ] Backup database regularly
- [ ] Rotate JWT secrets quarterly

### Performance
- [ ] Monitor API response times
- [ ] Optimize slow database queries
- [ ] Add database indexes if needed
- [ ] Scale server resources as needed
