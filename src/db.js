const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT,
      contact_info TEXT,
      photo_path TEXT,
      short_bio TEXT,
      soft_skills TEXT,
      technical_skills TEXT,
      academic_institute TEXT,
      academic_degree TEXT,
      academic_year TEXT,
      academic_grade TEXT,
      company_name TEXT,
      job_duration TEXT,
      job_responsibilities TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const addColumn = (name, definition) => {
    db.run(`ALTER TABLE resumes ADD COLUMN ${name} ${definition}`, (err) => {
      if (err && !/duplicate column name/i.test(err.message)) {
        console.error(`Failed to add column ${name}:`, err.message);
      }
    });
  };

  addColumn('previous_projects', 'TEXT');
  addColumn('social_links', 'TEXT');
  addColumn('job_experiences', 'TEXT');
  addColumn('academic_entries', 'TEXT');
});

module.exports = db;

