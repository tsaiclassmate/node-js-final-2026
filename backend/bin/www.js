const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('../db/pool');
const initDatabase = require('../db/init');

const app = express();

app.use(cors());
app.use(express.json());



const coachesRouter = require('../routes/coaches');
const creditPackageRouter = require('../routes/creditPackage');
const usersRouter = require('../routes/users');
//M1
app.use('/api/coaches', coachesRouter);

app.use('/api/credit-package', creditPackageRouter);
//M2
app.use('/api/users', usersRouter);

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