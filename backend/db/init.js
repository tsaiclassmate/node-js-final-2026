const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const initDatabase = async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, 'init.sql'),
    'utf8'
  );

  await pool.query(sql);

  console.log('Database initialized');
};

module.exports = initDatabase;