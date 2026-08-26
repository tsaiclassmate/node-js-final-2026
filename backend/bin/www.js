const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('../db/pool');
const initDatabase = require('../db/init');

const app = express();

app.use(cors());
app.use(express.json());


// =====================================================
// Routes
// =====================================================

const publicCoachesRouter = require('../routes/publicCoaches');
const coachesRouter = require('../routes/coaches');
const creditPackageRouter = require('../routes/creditPackage');
const usersRouter = require('../routes/users');
const adminCoachesRouter = require('../routes/adminCoaches');
const m5Router = require('../routes/m5');
const m6Router = require('../routes/m6');


// =====================================================
// M1
// =====================================================
app.use('/api/coaches', coachesRouter);
// =====================================================
// M4 公開瀏覽
// ⚠️ 一定放在 /api/coaches 前面
// =====================================================
app.use('/api', publicCoachesRouter);




// =====================================================
// Credit Package
// =====================================================
app.use('/api/credit-package', creditPackageRouter);


// =====================================================
// M2
// =====================================================
app.use('/api/users', usersRouter);


// =====================================================
// Admin / Coach
// =====================================================
app.use('/api/admin', adminCoachesRouter);


// =====================================================
// M5
// =====================================================
app.use('/api', m5Router);
// =====================================================
 // M6
 // =====================================================
app.use('/api', m6Router);

// =====================================================
// Health Check
// =====================================================
app.get('/healthcheck', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      status: 'ok'
    });

  } catch (error) {
    console.error('Database connection failed:', error);

    res.status(500).json({
      status: 'failed',
      message: 'Database connection failed'
    });
  }
});


const PORT = process.env.PORT || 8080;


const startServer = async () => {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
};


startServer();