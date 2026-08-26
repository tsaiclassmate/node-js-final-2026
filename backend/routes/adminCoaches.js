const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();


// =====================================================
// 共用：確認目前使用者是教練
// =====================================================
const requireCoach = async (req, res) => {
  const result = await pool.query(
    `
    SELECT id, name, role
    FROM users
    WHERE id = $1
    `,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    res.status(401).json({
      status: 'failed',
      message: '請先登入'
    });

    return null;
  }

  const user = result.rows[0];

  if (user.role !== 'COACH') {
    res.status(401).json({
      status: 'failed',
      message: '使用者尚未成為教練'
    });

    return null;
  }

  return user;
};


// =====================================================
// POST /api/admin/coaches/:userId
// 將使用者升級為教練
//
// ⚠️ 注意：
// 這支一定要放在 /coaches/courses 前面嗎？
// 不行！
// 所以實際上我們會把 /coaches/courses 放在前面。
// =====================================================


// =====================================================
// POST /api/admin/coaches/courses
// 開設課程
// =====================================================
router.post('/coaches/courses', auth, async (req, res) => {
  try {
    const user = await requireCoach(req, res);

    if (!user) {
      return;
    }

    const {
      skill_id,
      name,
      description,
      start_at,
      end_at,
      max_participants,
      meeting_url
    } = req.body;

    // ==========================================
    // 欄位驗證
    // ==========================================
    if (
      typeof skill_id !== 'string' ||
      skill_id.trim() === '' ||

      typeof name !== 'string' ||
      name.trim() === '' ||

      typeof description !== 'string' ||
      description.trim() === '' ||

      typeof start_at !== 'string' ||
      start_at.trim() === '' ||

      typeof end_at !== 'string' ||
      end_at.trim() === '' ||

      !Number.isInteger(max_participants) ||
      max_participants < 0 ||

      typeof meeting_url !== 'string' ||
      meeting_url.trim() === '' ||
      !meeting_url.startsWith('https://')
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 日期驗證
    // ==========================================
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 確認 skill 存在
    // ==========================================
    const skillResult = await pool.query(
      `
      SELECT id
      FROM skills
      WHERE id = $1
      `,
      [skill_id]
    );

    if (skillResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 找目前登入教練
    // ==========================================
    const coachResult = await pool.query(
      `
      SELECT id
      FROM coaches
      WHERE user_id = $1
      `,
      [req.user.id]
    );

    if (coachResult.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '使用者尚未成為教練'
      });
    }

    const coachId = coachResult.rows[0].id;

    // ==========================================
    // 建立課程
    // ==========================================
    const result = await pool.query(
      `
      INSERT INTO courses (
        coach_id,
        skill_id,
        name,
        description,
        start_at,
        end_at,
        max_participants,
        meeting_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        coach_id,
        skill_id,
        name,
        description,
        start_at,
        end_at,
        max_participants,
        meeting_url,
        created_at,
        updated_at
      `,
      [
        coachId,
        skill_id,
        name,
        description,
        start_at,
        end_at,
        max_participants,
        meeting_url
      ]
    );

    return res.status(201).json({
      status: 'success',
      data: {
        course: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Create course error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '建立課程失敗'
    });
  }
});


// =====================================================
// GET /api/admin/coaches/courses
// 取得自己的全部課程
// =====================================================
router.get('/coaches/courses', auth, async (req, res) => {
  try {
    const user = await requireCoach(req, res);

    if (!user) {
      return;
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.start_at,
        c.end_at,
        c.max_participants,
        c.meeting_url,

        CASE
          WHEN NOW() < c.start_at THEN '尚未開始'
          WHEN NOW() >= c.end_at THEN '已結束'
          ELSE '進行中'
        END AS status,

        COUNT(cb.id)
          FILTER (
            WHERE cb.status IS DISTINCT FROM 'CANCELLED'
          ) AS participants

      FROM courses c

      INNER JOIN coaches co
        ON co.id = c.coach_id

      LEFT JOIN course_bookings cb
        ON cb.course_id = c.id

      WHERE co.user_id = $1

      GROUP BY
        c.id,
        c.name,
        c.start_at,
        c.end_at,
        c.max_participants,
        c.meeting_url

      ORDER BY c.start_at DESC
      `,
      [req.user.id]
    );

    return res.status(200).json({
      status: 'success',
      data: result.rows
    });

  } catch (error) {
    console.error('Get courses error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得課程列表失敗'
    });
  }
});


// =====================================================
// GET /api/admin/coaches/courses/:courseId
// 取得單一課程詳情
//
// ⚠️ owner-scoped
// 課程不存在 OR 不是自己的課
// 都回：400 課程不存在
//
// ⚠️ 這支只驗登入，不驗教練身分
// =====================================================
router.get('/coaches/courses/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.start_at,
        c.end_at,
        c.max_participants,
        s.name AS skill_name,
        c.skill_id,
        c.meeting_url

      FROM courses c

      INNER JOIN coaches co
        ON co.id = c.coach_id

      LEFT JOIN skills s
        ON s.id = c.skill_id

      WHERE c.id = $1
        AND co.user_id = $2
      `,
      [courseId, req.user.id]
    );

    // 不存在 OR 不是自己的課
    // 都回同一個訊息
    if (result.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '課程不存在'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get single course error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得課程詳情失敗'
    });
  }
});


// =====================================================
// PUT /api/admin/coaches/courses/:courseId
// 更新單一課程
//
// ⚠️ 不支援部分更新
// 全部欄位都必填
//
// ⚠️ owner-scoped
// 不存在 OR 不是自己的課
// 都回：400 課程不存在
//
// ⚠️ 只驗登入，不驗教練身分
// =====================================================
router.put('/coaches/courses/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;

    const {
      skill_id,
      name,
      description,
      start_at,
      end_at,
      max_participants,
      meeting_url
    } = req.body;

    // ==========================================
    // 1. 先驗證欄位
    // ==========================================
    if (
      typeof skill_id !== 'string' ||
      skill_id.trim() === '' ||

      typeof name !== 'string' ||
      name.trim() === '' ||

      typeof description !== 'string' ||
      description.trim() === '' ||

      typeof start_at !== 'string' ||
      start_at.trim() === '' ||

      typeof end_at !== 'string' ||
      end_at.trim() === '' ||

      !Number.isInteger(max_participants) ||
      max_participants < 0 ||

      typeof meeting_url !== 'string' ||
      meeting_url.trim() === '' ||
      !meeting_url.startsWith('https://')
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 2. 驗證日期
    // ==========================================
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 3. 驗證 skill 是否存在
    // ==========================================
    const skillResult = await pool.query(
      `
      SELECT id
      FROM skills
      WHERE id = $1
      `,
      [skill_id]
    );

    if (skillResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 4. owner-scoped 查詢
    //
    // 注意：
    // 這裡同時使用 courseId + token userId
    // ==========================================
    const courseResult = await pool.query(
      `
      SELECT c.id
      FROM courses c

      INNER JOIN coaches co
        ON co.id = c.coach_id

      WHERE c.id = $1
        AND co.user_id = $2
      `,
      [courseId, req.user.id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '課程不存在'
      });
    }

    // ==========================================
    // 5. 更新課程
    // ==========================================
    const updateResult = await pool.query(
      `
      UPDATE courses
      SET
        skill_id = $1,
        name = $2,
        description = $3,
        start_at = $4,
        end_at = $5,
        max_participants = $6,
        meeting_url = $7,
        updated_at = NOW()

      WHERE id = $8

      RETURNING
        id,
        coach_id,
        skill_id,
        name,
        description,
        start_at,
        end_at,
        max_participants,
        meeting_url,
        created_at,
        updated_at
      `,
      [
        skill_id,
        name,
        description,
        start_at,
        end_at,
        max_participants,
        meeting_url,
        courseId
      ]
    );

    return res.status(200).json({
      status: 'success',
      data: {
        course: updateResult.rows[0]
      }
    });

  } catch (error) {
    console.error('Update single course error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '更新課程失敗'
    });
  }
});


// =====================================================
// POST /api/admin/coaches/:userId
// 將使用者升級為教練
//
// ⚠️ 一定放在 courses routes 後面
// =====================================================
router.post('/coaches/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const {
      experience_years,
      description,
      profile_image_url
    } = req.body;

    // ==========================================
    // 欄位驗證
    // ==========================================
    if (
      !Number.isInteger(experience_years) ||
      experience_years < 0 ||

      typeof description !== 'string' ||
      description.trim() === ''
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // profile_image_url 選填
    if (
      profile_image_url !== undefined &&
      profile_image_url !== '' &&
      (
        typeof profile_image_url !== 'string' ||
        !profile_image_url.startsWith('https://')
      )
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 查詢使用者
    // ==========================================
    const userResult = await pool.query(
      `
      SELECT id, name, role
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '使用者不存在'
      });
    }

    const user = userResult.rows[0];

    // ==========================================
    // 已經是教練
    // ==========================================
    if (user.role === 'COACH') {
      return res.status(409).json({
        status: 'failed',
        message: '使用者已經是教練'
      });
    }

    // ==========================================
    // 建立 coach
    // ==========================================
    const coachResult = await pool.query(
      `
      INSERT INTO coaches (
        user_id,
        experience_years,
        description,
        profile_image_url
      )
      VALUES ($1, $2, $3, $4)

      RETURNING
        id,
        user_id,
        experience_years,
        description,
        profile_image_url,
        created_at,
        updated_at
      `,
      [
        userId,
        experience_years,
        description,
        profile_image_url || null
      ]
    );

    // ==========================================
    // USER → COACH
    // ==========================================
    await pool.query(
      `
      UPDATE users
      SET role = 'COACH'
      WHERE id = $1
      `,
      [userId]
    );

    return res.status(201).json({
      status: 'success',
      data: {
        user: {
          name: user.name,
          role: 'COACH'
        },
        coach: coachResult.rows[0]
      }
    });

  } catch (error) {
    console.error('Upgrade coach error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '升級教練失敗'
    });
  }
});


// =====================================================
// GET /api/admin/coaches
// 取得登入教練自己的資料
// =====================================================
router.get('/coaches', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query(
      `
      SELECT id, role
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '請先登入'
      });
    }

    if (userResult.rows[0].role !== 'COACH') {
      return res.status(401).json({
        status: 'failed',
        message: '使用者尚未成為教練'
      });
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.experience_years,
        c.description,
        c.profile_image_url,

        COALESCE(
          ARRAY_AGG(cs.skill_id)
          FILTER (WHERE cs.skill_id IS NOT NULL),
          '{}'
        ) AS skill_ids

      FROM coaches c

      LEFT JOIN coach_skills cs
        ON cs.coach_id = c.id

      WHERE c.user_id = $1

      GROUP BY
        c.id,
        c.experience_years,
        c.description,
        c.profile_image_url
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '使用者尚未成為教練'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get coach profile error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得教練資料失敗'
    });
  }
});


// =====================================================
// PUT /api/admin/coaches
// 更新登入教練自己的資料
// =====================================================
router.put('/coaches', auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;

    const {
      experience_years,
      description,
      profile_image_url,
      skill_ids
    } = req.body;

    // ==========================================
    // 欄位驗證
    // ==========================================
    if (
      !Number.isInteger(experience_years) ||
      experience_years < 0 ||

      typeof description !== 'string' ||
      description.trim() === '' ||

      typeof profile_image_url !== 'string' ||
      profile_image_url.trim() === '' ||
      !profile_image_url.startsWith('https://') ||

      !Array.isArray(skill_ids) ||
      skill_ids.length === 0
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // UUID 驗證
    // ==========================================
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      !skill_ids.every(
        (id) =>
          typeof id === 'string' &&
          uuidRegex.test(id)
      )
    ) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // 找 coach
    // ==========================================
    const coachResult = await pool.query(
      `
      SELECT id
      FROM coaches
      WHERE user_id = $1
      `,
      [userId]
    );

    if (coachResult.rows.length === 0) {
      return res.status(401).json({
        status: 'failed',
        message: '使用者尚未成為教練'
      });
    }

    const coachId = coachResult.rows[0].id;

    // ==========================================
    // 確認技能存在
    // ==========================================
    const skillResult = await pool.query(
      `
      SELECT id
      FROM skills
      WHERE id = ANY($1::uuid[])
      `,
      [skill_ids]
    );

    if (skillResult.rows.length !== skill_ids.length) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // ==========================================
    // Transaction
    // ==========================================
    await client.query('BEGIN');

    await client.query(
      `
      UPDATE coaches
      SET
        experience_years = $1,
        description = $2,
        profile_image_url = $3,
        updated_at = NOW()

      WHERE id = $4
      `,
      [
        experience_years,
        description,
        profile_image_url,
        coachId
      ]
    );

    // ==========================================
    // 清除舊技能
    // ==========================================
    await client.query(
      `
      DELETE FROM coach_skills
      WHERE coach_id = $1
      `,
      [coachId]
    );

    // ==========================================
    // 建立新技能
    // ==========================================
    for (const skillId of skill_ids) {
      await client.query(
        `
        INSERT INTO coach_skills (
          coach_id,
          skill_id
        )
        VALUES ($1, $2)
        `,
        [
          coachId,
          skillId
        ]
      );
    }

    await client.query('COMMIT');

    // ==========================================
    // 重新查詢
    // ==========================================
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.experience_years,
        c.description,
        c.profile_image_url,

        COALESCE(
          ARRAY_AGG(cs.skill_id)
          FILTER (WHERE cs.skill_id IS NOT NULL),
          '{}'
        ) AS skill_ids

      FROM coaches c

      LEFT JOIN coach_skills cs
        ON cs.coach_id = c.id

      WHERE c.id = $1

      GROUP BY
        c.id,
        c.experience_years,
        c.description,
        c.profile_image_url
      `,
      [coachId]
    );

    return res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Update coach profile error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '更新教練資料失敗'
    });

  } finally {
    client.release();
  }
});


module.exports = router;