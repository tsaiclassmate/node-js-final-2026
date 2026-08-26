const express = require('express');
const { randomUUID } = require('crypto');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/coaches/skill
router.get('/skill', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        created_at AS "createdAt"
      FROM skills
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
      message: '取得技能失敗'
    });
  }
});

// POST /api/coaches/skill
router.post('/skill', async (req, res) => {
  const { name } = req.body;

  // 欄位驗證
  if (
    typeof name !== 'string' ||
    name.trim() === ''
  ) {
    return res.status(400).json({
      status: 'failed',
      message: '欄位未填寫正確'
    });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO skills (id, name)
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        created_at AS "createdAt"
      `,
      [randomUUID(), name.trim()]
    );

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    // PostgreSQL UNIQUE constraint
    if (error.code === '23505') {
      return res.status(409).json({
        status: 'failed',
        message: '資料重複'
      });
    }

    console.error(error);

    res.status(500).json({
      status: 'failed',
      message: '新增技能失敗'
    });
  }
});

// DELETE /api/coaches/skill/:skillId
router.delete('/skill/:skillId', async (req, res) => {
  const { skillId } = req.params;

  // UUID 格式驗證
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(skillId)) {
    return res.status(400).json({
      status: 'failed',
      message: 'ID錯誤'
    });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM skills
      WHERE id = $1
      RETURNING id
      `,
      [skillId]
    );

    // UUID 合法，但是資料不存在
    if (result.rowCount === 0) {
      return res.status(400).json({
        status: 'failed',
        message: 'ID錯誤'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        affected: result.rowCount
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: 'failed',
      message: '刪除技能失敗'
    });
  }
});

module.exports = router;