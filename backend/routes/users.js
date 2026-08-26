const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

const passwordRegex =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,16}$/;

const PASSWORD_ERROR =
  '密碼不符合規則，需要包含英文數字大小寫，最短8個字，最長16個字';


// ======================================
// POST /api/users/signup
// 註冊新會員
// ======================================
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. 檢查必填欄位
    if (
      typeof name !== 'string' ||
      name.trim() === '' ||
      typeof email !== 'string' ||
      email.trim() === '' ||
      typeof password !== 'string' ||
      password.trim() === ''
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // 2. 檢查密碼格式
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        status: 'failed',
        message: PASSWORD_ERROR
      });
    }

    // 3. 檢查 Email 是否重複
    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [email.trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        status: 'failed',
        message: 'Email 已被使用'
      });
    }

    // 4. 加密密碼
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. 建立會員
    const result = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        password,
        role
      )
      VALUES ($1, $2, $3, 'USER')
      RETURNING id, name
      `,
      [
        name.trim(),
        email.trim(),
        hashedPassword
      ]
    );

    const user = result.rows[0];

    // 6. 成功
    return res.status(201).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          name: user.name
        }
      }
    });

  } catch (error) {
    console.error('Signup error:', error);

    // PostgreSQL UNIQUE constraint
    if (error.code === '23505') {
      return res.status(409).json({
        status: 'failed',
        message: 'Email 已被使用'
      });
    }

    return res.status(500).json({
      status: 'failed',
      message: '註冊失敗'
    });
  }
});


// ======================================
// POST /api/users/login
// 會員登入
// ======================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. 檢查必填欄位
    if (
      typeof email !== 'string' ||
      email.trim() === '' ||
      typeof password !== 'string' ||
      password.trim() === ''
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // 2. 檢查密碼格式
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        status: 'failed',
        message: PASSWORD_ERROR
      });
    }

    // 3. 查詢使用者
    const result = await pool.query(
      `
      SELECT id, name, email, password, role
      FROM users
      WHERE email = $1
      `,
      [email.trim()]
    );

    // 4. 帳號不存在
    if (result.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '使用者不存在或密碼輸入錯誤'
      });
    }

    const user = result.rows[0];

    // 5. 比對密碼
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(400).json({
        status: 'failed',
        message: '使用者不存在或密碼輸入錯誤'
      });
    }

    // 6. 建立 JWT
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_DAY || '30d'
      }
    );

    // 7. 登入成功
    return res.status(201).json({
      status: 'success',
      data: {
        token,
        user: {
          name: user.name
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '登入失敗'
    });
  }
});


// ======================================
// GET /api/users/profile
// 取得本人個人資料
// ======================================
router.get('/profile', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT name, email
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '無效的 token'
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      status: 'success',
      data: {
        user: {
          name: user.name,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error('Profile error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得個人資料失敗'
    });
  }
});


// ======================================
// PUT /api/users/profile
// 更新本人暱稱
// ======================================
router.put('/profile', auth, async (req, res) => {
  try {
    const { name } = req.body;

    // 1. 檢查 name
    if (
      typeof name !== 'string' ||
      name.trim() === ''
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // 2. 查詢目前使用者
    const currentResult = await pool.query(
      `
      SELECT name
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '無效的 token'
      });
    }

    const currentName = currentResult.rows[0].name;

    // 3. 新舊名稱相同
    if (name === currentName) {
      return res.status(400).json({
        status: 'failed',
        message: '使用者名稱未變更'
      });
    }

    // 4. 更新名稱
    const result = await pool.query(
      `
      UPDATE users
      SET name = $1
      WHERE id = $2
      RETURNING name
      `,
      [name.trim(), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '更新使用者資料失敗'
      });
    }

    // 5. 成功
    return res.status(200).json({
      status: 'success',
      data: {
        user: {
          name: result.rows[0].name
        }
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '更新使用者資料失敗'
    });
  }
});


// ======================================
// PUT /api/users/password
// 修改本人登入密碼
// ======================================
router.put('/password', auth, async (req, res) => {
  try {
    const {
      password,
      new_password,
      confirm_new_password
    } = req.body;

    // 1. 三個欄位都必須存在
    if (
      typeof password !== 'string' ||
      password.trim() === '' ||
      typeof new_password !== 'string' ||
      new_password.trim() === '' ||
      typeof confirm_new_password !== 'string' ||
      confirm_new_password.trim() === ''
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // 2. 三個密碼全部檢查規則
    if (
      !passwordRegex.test(password) ||
      !passwordRegex.test(new_password) ||
      !passwordRegex.test(confirm_new_password)
    ) {
      return res.status(400).json({
        status: 'failed',
        message: PASSWORD_ERROR
      });
    }

    // 3. 新密碼不能跟舊密碼相同
    if (password === new_password) {
      return res.status(400).json({
        status: 'failed',
        message: '新密碼不能與舊密碼相同'
      });
    }

    // 4. 新密碼與確認密碼必須相同
    if (new_password !== confirm_new_password) {
      return res.status(400).json({
        status: 'failed',
        message: '新密碼與驗證新密碼不一致'
      });
    }

    // 5. 查詢目前使用者
    const result = await pool.query(
      `
      SELECT password
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '無效的 token'
      });
    }

    const user = result.rows[0];

    // 6. 比對舊密碼
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(400).json({
        status: 'failed',
        message: '密碼輸入錯誤'
      });
    }

    // 7. 加密新密碼
    const hashedPassword = await bcrypt.hash(
      new_password,
      10
    );

    // 8. 更新密碼
    await pool.query(
      `
      UPDATE users
      SET password = $1
      WHERE id = $2
      `,
      [hashedPassword, req.user.id]
    );

    // 9. 成功
    return res.status(200).json({
      status: 'success',
      data: null
    });

  } catch (error) {
    console.error('Update password error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '修改密碼失敗'
    });
  }
});


module.exports = router;