
const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();


// =====================================================
// GET /api/admin/coaches/revenue
// 取得教練本人指定月份的營收統計
// =====================================================
router.get('/admin/coaches/revenue', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // =================================================
    // ① 檢查 month
    // =================================================
    const { month } = req.query;

    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december'
    ];

    if (!month || !months.includes(month)) {
      return res.status(400).json({
        status: 'failed',
        message: '欄位未填寫正確'
      });
    }

    // =================================================
    // ② 確認登入者是否為教練
    // =================================================
    const coachResult = await pool.query(
      `
      SELECT id
      FROM coaches
      WHERE user_id = $1
      LIMIT 1
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

    // =================================================
    // ③ 取得目前年份
    // =================================================
    const currentYear = new Date().getFullYear();

    // month → 月份數字
    const monthNumber = months.indexOf(month) + 1;

    // =================================================
    // ④ 計算指定月份的開始與結束時間
    // =================================================
    const startDate = new Date(
      Date.UTC(currentYear, monthNumber - 1, 1)
    );

    const endDate = new Date(
      Date.UTC(currentYear, monthNumber, 1)
    );

    // =================================================
    // ⑤ 計算全部方案的單堂均價
    //
    // 單堂均價 =
    // Σ price / Σ credit_amount
    // =================================================
    const packageResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(price), 0) AS total_price,
        COALESCE(SUM(credit_amount), 0) AS total_credits
      FROM credit_packages
      `
    );

    const totalPrice =
      Number(packageResult.rows[0].total_price);

    const totalCredits =
      Number(packageResult.rows[0].total_credits);

    // =================================================
    // ⑥ 如果沒有任何方案
    // =================================================
    if (totalCredits === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          total: {
            revenue: 0,
            participants: 0,
            course_count: 0
          }
        }
      });
    }

    // =================================================
    // ⑦ 查詢指定月份的有效報名
    //
    // 重要：
    // 使用 course_bookings.created_at 判斷月份
    // 不是 courses.start_at
    //
    // 已取消的報名不計
    // =================================================
    const bookingResult = await pool.query(
      `
      SELECT
        cb.user_id
      FROM course_bookings cb

      INNER JOIN courses c
        ON c.id = cb.course_id

      WHERE c.coach_id = $1
        AND cb.cancelled_at IS NULL
        AND cb.created_at >= $2
        AND cb.created_at < $3
      `,
      [
        coachId,
        startDate.toISOString(),
        endDate.toISOString()
      ]
    );

    // =================================================
    // ⑧ 報名筆數
    // =================================================
    const courseCount = bookingResult.rows.length;

    // =================================================
    // ⑨ 不重複報名學員數
    // =================================================
    const participants = new Set(
      bookingResult.rows.map(row => row.user_id)
    ).size;

    // =================================================
    // ⑩ 單堂均價
    // =================================================
    const averagePrice =
      totalPrice / totalCredits;

    // =================================================
    // ⑪ 營收
    //
    // floor 放在最後一步
    //
    // revenue =
    // floor(course_count × averagePrice)
    // =================================================
    const revenue = Math.floor(
      courseCount * averagePrice
    );

    // =================================================
    // ⑫ 回傳
    // =================================================
    return res.status(200).json({
      status: 'success',
      data: {
        total: {
          revenue,
          participants,
          course_count: courseCount
        }
      }
    });

  } catch (error) {
    console.error('Get coach revenue error:', error);

    return res.status(500).json({
      status: 'failed',
      message: '取得營收統計失敗'
    });
  }
});


module.exports = router;

