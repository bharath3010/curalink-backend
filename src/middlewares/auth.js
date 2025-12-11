import jwt from 'jsonwebtoken';

export default function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded; // { userId, role }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
