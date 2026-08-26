const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 沒有 Authorization 或不是 Bearer
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'failed',
      message: '請先登入'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 確認使用者還存在
    const result = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '無效的 token'
      });
    }

    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'failed',
        message: 'Token 已過期'
      });
    }

    return res.status(401).json({
      status: 'failed',
      message: '無效的 token'
    });
  }
};

module.exports = auth;