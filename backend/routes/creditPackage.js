const express = require('express');
const pool = require('../db/pool');
const crypto = require('crypto');

const router = express.Router();

// GET /api/credit-package
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        credit_amount,
        price,
        created_at AS "createdAt"
      FROM credit_packages
      ORDER BY created_at ASC
    `);

    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: 'failed',
      message: '取得方案失敗'
    });
  }
});


// POST /api/credit-package
router.post('/', async (req, res) => {
  try {
    const { name, credit_amount, price } = req.body;

    // 欄位驗證
    if (
      typeof name !== 'string' ||
      name.trim() === '' ||
      typeof credit_amount !== 'number' ||
      !Number.isInteger(credit_amount) ||
      credit_amount < 0 ||
      typeof price !== 'number' ||
      !Number.isInteger(price) ||
      price < 0
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // 檢查名稱是否重複
    const existing = await pool.query(
      'SELECT id FROM credit_packages WHERE name = $1',
      [name.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: 'failed',
        message: '資料重複'
      });
    }

    // 新增資料
    const id = crypto.randomUUID();

    const result = await pool.query(
      `
      INSERT INTO credit_packages
        (id, name, credit_amount, price)
      VALUES
        ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        credit_amount,
        price,
        created_at AS "createdAt"
      `,
      [id, name.trim(), credit_amount, price]
    );

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    // PostgreSQL UNIQUE constraint
    if (error.code === '23505') {
      return res.status(409).json({
        status: 'failed',
        message: '資料重複'
      });
    }

    res.status(500).json({
      status: 'failed',
      message: '新增方案失敗'
    });
  }
});

// DELETE /api/credit-package/:creditPackageId
router.delete('/:creditPackageId', async (req, res) => {
  try {
    const { creditPackageId } = req.params;

    // 檢查 UUID 格式
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(creditPackageId)) {
      return res.status(400).json({
        status: 'failed',
        message: 'ID錯誤'
      });
    }

    const result = await pool.query(
      `
      DELETE FROM credit_packages
      WHERE id = $1
      RETURNING id
      `,
      [creditPackageId]
    );

    // UUID 正確，但查不到資料
    if (result.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: 'ID錯誤'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        affected: 1
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: 'failed',
      message: '刪除方案失敗'
    });
  }
});

module.exports = router;