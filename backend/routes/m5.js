
const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();


// =====================================================
// POST /api/credit-package/:creditPackageId
// 購買堂數方案
// =====================================================
router.post('/credit-package/:creditPackageId', auth, async (req, res) => {
  try {
    const { creditPackageId } = req.params;
    const userId = req.user.id;

    // 查詢方案
    const packageResult = await pool.query(
      `
      SELECT
        id,
        credit_amount,
        price
      FROM credit_packages
      WHERE id = $1
      `,
      [creditPackageId]
    );

    // 方案不存在
    if (packageResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: 'ID錯誤'
      });
    }

    const creditPackage = packageResult.rows[0];

    // 建立購買紀錄
    await pool.query(
      `
      INSERT INTO credit_purchases (
        user_id,
        credit_package_id,
        purchased_credits,
        price_paid
      )
      VALUES ($1, $2, $3, $4)
      `,
      [
        userId,
        creditPackage.id,
        creditPackage.credit_amount,
        creditPackage.price
      ]
    );

    return res.status(200).json({
      status: 'success',
      data: null
    });

  } catch (error) {
    console.error('Purchase credit package error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '購買方案失敗'
    });
  }
});


// =====================================================
// GET /api/users/credit-package
// 取得本人的購買方案紀錄
// =====================================================
router.get('/users/credit-package', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        cp.name,
        p.purchased_credits,
        p.price_paid::numeric AS price_paid,
        p.purchase_at
      FROM credit_purchases p
      INNER JOIN credit_packages cp
        ON cp.id = p.credit_package_id
      WHERE p.user_id = $1
      ORDER BY p.purchase_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      status: 'success',
      data: result.rows
    });

  } catch (error) {
    console.error('Get credit package history error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得購買紀錄失敗'
    });
  }
});


// =====================================================
// GET /api/users/courses
// 取得本人的課表與剩餘堂數
// =====================================================
router.get('/users/courses', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // =================================================
    // ① 計算全部購買堂數
    // =================================================
    const purchaseResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(purchased_credits), 0) AS total_credits
      FROM credit_purchases
      WHERE user_id = $1
      `,
      [userId]
    );

    // =================================================
    // ② 計算未取消的報名數
    // =================================================
    const usageResult = await pool.query(
      `
      SELECT
        COUNT(*) AS used_credits
      FROM course_bookings
      WHERE user_id = $1
        AND cancelled_at IS NULL
      `,
      [userId]
    );

    const totalCredits =
      Number(purchaseResult.rows[0].total_credits);

    const usedCredits =
      Number(usageResult.rows[0].used_credits);

    // 剩餘堂數 = 購買總堂數 - 未取消報名數
    const creditRemain =
      totalCredits - usedCredits;

    // =================================================
    // ③ 取得所有報名紀錄
    // 注意：包含已取消的紀錄
    // =================================================
    const bookingResult = await pool.query(
      `
      SELECT
        c.id AS course_id,
        c.name,
        c.start_at,
        c.end_at,
        c.meeting_url,
        u.name AS coach_name,
        cb.cancelled_at
      FROM course_bookings cb

      INNER JOIN courses c
        ON c.id = cb.course_id

      INNER JOIN coaches co
        ON co.id = c.coach_id

      INNER JOIN users u
        ON u.id = co.user_id

      WHERE cb.user_id = $1

      ORDER BY c.start_at ASC
      `,
      [userId]
    );

    return res.status(200).json({
      status: 'success',
      data: {
        credit_remain: creditRemain,
        credit_usage: usedCredits,
        course_booking: bookingResult.rows
      }
    });

  } catch (error) {
    console.error('Get user courses error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得課表失敗'
    });
  }
});


// =====================================================
// POST /api/courses/:courseId
// 報名課程
// =====================================================
router.post('/courses/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // =================================================
    // ① courseId 查無課程
    // =================================================
    const courseResult = await pool.query(
      `
      SELECT
        id,
        max_participants
      FROM courses
      WHERE id = $1
      `,
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: 'ID錯誤'
      });
    }

    const course = courseResult.rows[0];

    // =================================================
    // ② 已經報名過
    // 包含已取消的報名紀錄
    // =================================================
    const existingBooking = await pool.query(
      `
      SELECT id
      FROM course_bookings
      WHERE user_id = $1
        AND course_id = $2
      LIMIT 1
      `,
      [userId, courseId]
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({
        status: 'failed',
        message: '已經報名過此課程'
      });
    }

    // =================================================
    // ③ 計算剩餘堂數
    // =================================================
    const creditResult = await pool.query(
      `
      SELECT
        (
          SELECT COALESCE(SUM(purchased_credits), 0)
          FROM credit_purchases
          WHERE user_id = $1
        )
        -
        (
          SELECT COUNT(*)
          FROM course_bookings
          WHERE user_id = $1
            AND cancelled_at IS NULL
        ) AS credit_remain
      `,
      [userId]
    );

    const creditRemain =
      Number(creditResult.rows[0].credit_remain);

    if (creditRemain <= 0) {
      return res.status(400).json({
        status: 'failed',
        message: '已無可使用堂數'
      });
    }

    // =================================================
    // ④ 確認課程是否額滿
    // =================================================
    const participantResult = await pool.query(
      `
      SELECT COUNT(*) AS participant_count
      FROM course_bookings
      WHERE course_id = $1
        AND cancelled_at IS NULL
      `,
      [courseId]
    );

    const participantCount =
      Number(participantResult.rows[0].participant_count);

    if (participantCount >= Number(course.max_participants)) {
      return res.status(400).json({
        status: 'failed',
        message: '已達最大參加人數，無法參加'
      });
    }

    // =================================================
    // ⑤ 建立報名紀錄
    // =================================================
    await pool.query(
      `
      INSERT INTO course_bookings (
        user_id,
        course_id
      )
      VALUES ($1, $2)
      `,
      [userId, courseId]
    );

    return res.status(201).json({
      status: 'success',
      data: null
    });

  } catch (error) {
    console.error('Create course booking error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '報名課程失敗'
    });
  }
});


// =====================================================
// DELETE /api/courses/:courseId
// 取消課程報名
// =====================================================
router.delete('/courses/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // =================================================
    // 找目前有效的報名
    // =================================================
    const bookingResult = await pool.query(
      `
      SELECT id
      FROM course_bookings
      WHERE user_id = $1
        AND course_id = $2
        AND cancelled_at IS NULL
      LIMIT 1
      `,
      [userId, courseId]
    );

    // 找不到可取消的報名
    if (bookingResult.rows.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: 'ID錯誤'
      });
    }

    // =================================================
    // 軟刪除
    // 不刪除紀錄，只設定 cancelled_at
    // =================================================
    const updateResult = await pool.query(
      `
      UPDATE course_bookings
      SET cancelled_at = NOW()
      WHERE id = $1
        AND cancelled_at IS NULL
      `,
      [bookingResult.rows[0].id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '取消失敗'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: null
    });

  } catch (error) {
    console.error('Cancel course booking error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取消課程失敗'
    });
  }
});


module.exports = router;

