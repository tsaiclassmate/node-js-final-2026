const express = require('express');
const pool = require('../db/pool');

const router = express.Router();


// =====================================================
// UUID 格式檢查
// =====================================================
const isValidUUID = (value) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};


// =====================================================
// GET /api/coaches
// 公開取得教練列表
//
// Query:
// ?per=10&page=1
// =====================================================
router.get('/coaches', async (req, res) => {
  try {
    const { per, page } = req.query;

    if (per === undefined || page === undefined) {
      return res.status(400).json({
        status: 'failed',
        message: '請提供 per 與 page'
      });
    }

    const perNumber = Number(per);
    const pageNumber = Number(page);

    if (
      !Number.isInteger(perNumber) ||
      !Number.isInteger(pageNumber) ||
      perNumber <= 0 ||
      pageNumber <= 0
    ) {
      return res.status(400).json({
        status: 'failed',
        message: 'per 與 page 格式錯誤'
      });
    }

    const offset = (pageNumber - 1) * perNumber;

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.user_id,
        u.name
      FROM coaches c
      INNER JOIN users u
        ON u.id = c.user_id
      WHERE u.role = 'COACH'
      ORDER BY c.created_at DESC
      LIMIT $1
      OFFSET $2
      `,
      [perNumber, offset]
    );

    return res.status(200).json({
      status: 'success',
      data: result.rows
    });

  } catch (error) {
    console.error('Get public coaches error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得教練列表失敗'
    });
  }
});


// =====================================================
// GET /api/coaches/:coachId/courses
// 公開取得某教練的課程
//
// ⚠️ 放在 /coaches/:coachId 前面
// =====================================================
router.get('/coaches/:coachId/courses', async (req, res) => {
  try {
    const { coachId } = req.params;

    // UUID 不合法
    if (!isValidUUID(coachId)) {
      return res.status(404).json({
        status: 'failed',
        message: '教練不存在'
      });
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.start_at,
        c.end_at,
        c.max_participants,
        c.meeting_url,

        u.name AS coach_name,
        s.name AS skill_name

      FROM courses c

      INNER JOIN coaches co
        ON co.id = c.coach_id

      INNER JOIN users u
        ON u.id = co.user_id

      LEFT JOIN skills s
        ON s.id = c.skill_id

      WHERE c.coach_id = $1
        AND c.end_at > NOW()

      ORDER BY c.start_at ASC
      `,
      [coachId]
    );

    return res.status(200).json({
      status: 'success',
      data: result.rows
    });

  } catch (error) {
    console.error('Get coach courses error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得教練課程失敗'
    });
  }
});


// =====================================================
// GET /api/coaches/:coachId
// 公開取得單一教練詳情
// =====================================================
router.get('/coaches/:coachId', async (req, res) => {
  try {
    const { coachId } = req.params;

    // ⭐ 防止 /coaches/skill 被當成 UUID
    if (!isValidUUID(coachId)) {
      return res.status(404).json({
        status: 'failed',
        message: '教練不存在'
      });
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.user_id,
        c.experience_years,
        c.description,
        c.profile_image_url,

        u.name,
        u.email

      FROM coaches c

      INNER JOIN users u
        ON u.id = c.user_id

      WHERE c.id = $1
        AND u.role = 'COACH'
      `,
      [coachId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'failed',
        message: '教練不存在'
      });
    }

    const coach = result.rows[0];

    // 查詢技能
    const skillResult = await pool.query(
      `
      SELECT
        s.id,
        s.name
      FROM coach_skills cs
      INNER JOIN skills s
        ON s.id = cs.skill_id
      WHERE cs.coach_id = $1
      ORDER BY s.name
      `,
      [coachId]
    );

    return res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: coach.user_id,
          name: coach.name,
          email: coach.email
        },
        coach: {
          id: coach.id,
          experience_years: coach.experience_years,
          description: coach.description,
          profile_image_url: coach.profile_image_url,
          skills: skillResult.rows
        }
      }
    });

  } catch (error) {
    console.error('Get public coach detail error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得教練詳情失敗'
    });
  }
});


// =====================================================
// GET /api/courses
// 公開取得「進行中」課程
//
// start_at <= NOW() < end_at
// =====================================================
router.get('/courses', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.start_at,
        c.end_at,
        c.max_participants,
        c.meeting_url,

        co.id AS coach_id,
        u.name AS coach_name,

        s.id AS skill_id,
        s.name AS skill_name

      FROM courses c

      INNER JOIN coaches co
        ON co.id = c.coach_id

      INNER JOIN users u
        ON u.id = co.user_id

      LEFT JOIN skills s
        ON s.id = c.skill_id

      WHERE c.start_at <= NOW()
        AND NOW() < c.end_at

      ORDER BY c.start_at ASC
      `
    );

    return res.status(200).json({
      status: 'success',
      data: result.rows
    });

  } catch (error) {
    console.error('Get ongoing courses error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得進行中課程失敗'
    });
  }
});


module.exports = router;