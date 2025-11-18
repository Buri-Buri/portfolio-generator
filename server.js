const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const db = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: path.join(__dirname, 'data'),
    }),
    secret: process.env.SESSION_SECRET || 'portfolio-generator-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const base = (req.session.userId || 'guest') + '-' + timestamp;
    cb(null, base + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only JPG and PNG files are allowed'));
    }
    cb(null, true);
  },
});

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const parseJsonField = (value, fallback = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
};

const formatResume = (resume) => {
  if (!resume) return null;
  return {
    ...resume,
    previous_projects: parseJsonField(resume.previous_projects),
    social_links: parseJsonField(resume.social_links),
    job_experiences: parseJsonField(resume.job_experiences),
    academic_entries: parseJsonField(resume.academic_entries),
  };
};

const ensureApiAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const ensurePageAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

const sendPage = (page) => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', page));

app.get('/', sendPage('index.html'));
app.get('/login', sendPage('login.html'));
app.get('/register', sendPage('register.html'));
app.get('/resume', sendPage('resume.html'));

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [email]);

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await dbRun('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [
      name,
      email,
      hashedPassword,
    ]);

    return res.status(201).json({ message: 'Account created. Please log in.' });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Unable to register. Please try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    return res.json({ message: 'Login successful', user: req.session.user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Unable to log in. Please try again.' });
  }
});

app.get('/api/session', (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }

  return res.json({ authenticated: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/resume', ensureApiAuth, async (req, res) => {
  try {
    const resume = await dbGet('SELECT * FROM resumes WHERE user_id = ?', [req.session.userId]);
    res.json({ resume: formatResume(resume) });
  } catch (error) {
    console.error('Resume fetch error:', error);
    res.status(500).json({ error: 'Unable to load resume. Please try again.' });
  }
});

app.post('/api/resume', ensureApiAuth, upload.single('photo'), async (req, res) => {
  const {
    full_name,
    contact_info,
    short_bio,
    soft_skills,
    technical_skills,
    academic_institute,
    academic_degree,
    academic_year,
    academic_grade,
    company_name = '',
    job_duration = '',
    job_responsibilities = '',
    previous_projects,
    social_links,
    job_experiences,
    academic_entries,
  } = req.body;

  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const projectList = parseJsonField(previous_projects);
  const socialList = parseJsonField(social_links);
  const experienceList = parseJsonField(job_experiences);
  const academicList = parseJsonField(academic_entries);

  try {
    const existing = await dbGet('SELECT * FROM resumes WHERE user_id = ?', [req.session.userId]);

    const finalPhotoPath = photoPath || (existing ? existing.photo_path : null);
    const primaryExperience = experienceList[0] || {};
    const fallbackCompany = company_name || primaryExperience.company || '';
    const fallbackDuration = job_duration || primaryExperience.duration || '';
    const fallbackResponsibilities =
      job_responsibilities || primaryExperience.responsibilities || '';

    if (existing) {
      await dbRun(
        `
          UPDATE resumes
          SET full_name = ?, contact_info = ?, photo_path = ?, short_bio = ?,
              soft_skills = ?, technical_skills = ?, academic_institute = ?,
              academic_degree = ?, academic_year = ?, academic_grade = ?,
              company_name = ?, job_duration = ?, job_responsibilities = ?,
              previous_projects = ?, social_links = ?, job_experiences = ?,
              academic_entries = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `,
        [
          full_name,
          contact_info,
          finalPhotoPath,
          short_bio,
          soft_skills,
          technical_skills,
          academic_institute,
          academic_degree,
          academic_year,
          academic_grade,
          fallbackCompany,
          fallbackDuration,
          fallbackResponsibilities,
          JSON.stringify(projectList),
          JSON.stringify(socialList),
          JSON.stringify(experienceList),
          JSON.stringify(academicList),
          req.session.userId,
        ]
      );
    } else {
      await dbRun(
        `
          INSERT INTO resumes (
            user_id, full_name, contact_info, photo_path, short_bio,
            soft_skills, technical_skills, academic_institute, academic_degree,
            academic_year, academic_grade, company_name, job_duration,
            job_responsibilities, previous_projects, social_links, job_experiences,
            academic_entries
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          req.session.userId,
          full_name,
          contact_info,
          finalPhotoPath,
          short_bio,
          soft_skills,
          technical_skills,
          academic_institute,
          academic_degree,
          academic_year,
          academic_grade,
          fallbackCompany,
          fallbackDuration,
          fallbackResponsibilities,
          JSON.stringify(projectList),
          JSON.stringify(socialList),
          JSON.stringify(experienceList),
          JSON.stringify(academicList),
        ]
      );
    }

    const updatedResume = await dbGet('SELECT * FROM resumes WHERE user_id = ?', [
      req.session.userId,
    ]);

    res.json({ message: 'Resume saved successfully', resume: formatResume(updatedResume) });
  } catch (error) {
    console.error('Resume save error:', error);
    res.status(500).json({ error: 'Unable to save resume. Please try again.' });
  }
});

app.get('/resume/pdf', ensurePageAuth, async (req, res) => {
  try {
    const resume = await dbGet('SELECT * FROM resumes WHERE user_id = ?', [req.session.userId]);

    if (!resume) {
      return res.redirect('/resume');
    }

    const projectList = parseJsonField(resume.previous_projects);
    const socialList = parseJsonField(resume.social_links);
    const experienceList = parseJsonField(resume.job_experiences);
    const academicListRaw = parseJsonField(resume.academic_entries);
    const hasLegacyAcademic =
      resume.academic_institute ||
      resume.academic_degree ||
      resume.academic_year ||
      resume.academic_grade;
    const academicList =
      academicListRaw.length > 0
        ? academicListRaw
        : hasLegacyAcademic
        ? [
            {
              institute: resume.academic_institute,
              degree: resume.academic_degree,
              year: resume.academic_year,
              grade: resume.academic_grade,
            },
          ]
        : [];
    const experiencesToRender =
      experienceList.length > 0
        ? experienceList
        : [
            {
              company: resume.company_name,
              duration: resume.job_duration,
              responsibilities: resume.job_responsibilities,
            },
          ].filter(
            (exp) => exp.company || exp.duration || exp.responsibilities
          );

    const doc = new PDFDocument();
    const filename = `resume-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    doc.fontSize(20).text(resume.full_name || 'Unnamed Candidate', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(resume.contact_info || 'Contact info not provided');
    doc.moveDown();

    if (resume.photo_path) {
      const absolutePhotoPath = path.join(__dirname, resume.photo_path);
      if (fs.existsSync(absolutePhotoPath)) {
        try {
          doc.image(absolutePhotoPath, {
            width: 120,
            align: 'left',
          });
          doc.moveDown();
        } catch (err) {
          console.warn('Unable to embed photo:', err.message);
        }
      }
    }

    doc.fontSize(14).text('About Me', { underline: true });
    doc.fontSize(12).text(resume.short_bio || 'Not provided');
    doc.moveDown();

    doc.fontSize(14).text('Soft Skills', { underline: true });
    doc.fontSize(12).text(resume.soft_skills || 'Not provided');
    doc.moveDown();

    doc.fontSize(14).text('Technical Skills', { underline: true });
    doc.fontSize(12).text(resume.technical_skills || 'Not provided');
    doc.moveDown();

    if (projectList.length > 0) {
      doc.fontSize(14).text('Previous Work / Projects', { underline: true });
      projectList.forEach((project) => {
        const title = project.title || 'Untitled Project';
        doc.fontSize(12).text(title);
        if (project.description) {
          doc.text(project.description);
        }
        if (project.link) {
          doc
            .fillColor('blue')
            .text(project.link, { link: project.link, underline: true });
          doc.fillColor('black');
        }
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }

    if (socialList.length > 0) {
      doc.fontSize(14).text('Social Links', { underline: true });
      socialList.forEach((link) => {
        const label = link.label || link.platform || 'Profile';
        if (link.url) {
          doc
            .fontSize(12)
            .text(`${label}: ${link.url}`, { link: link.url, underline: true });
        } else {
          doc.fontSize(12).text(`${label}`);
        }
      });
      doc.moveDown();
    }

    if (academicList.length > 0) {
      doc.fontSize(14).text('Academic Background', { underline: true });
      academicList.forEach((entry) => {
        doc.fontSize(12).text(`${entry.degree || 'Degree N/A'} at ${entry.institute || 'Institute N/A'}`);
        if (entry.year || entry.grade) {
          doc.text(`Year: ${entry.year || 'N/A'} | Grade: ${entry.grade || 'N/A'}`);
        }
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }

    if (experiencesToRender.length > 0) {
      doc.fontSize(14).text('Work Experience', { underline: true });
      experiencesToRender.forEach((exp) => {
        doc.fontSize(12).text(exp.company || 'Company N/A');
        doc.text(`Duration: ${exp.duration || 'N/A'}`);
        doc.text(exp.responsibilities || 'Responsibilities not provided');
        doc.moveDown(0.5);
      });
    } else {
      doc.fontSize(14).text('Work Experience', { underline: true });
      doc.fontSize(12).text('No experience provided');
    }

    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.redirect('/resume');
  }
});

app.use((err, req, res, next) => {
  const message = err && err.message ? err.message : 'Unexpected error';
  if (err instanceof multer.MulterError || message.includes('Only JPG')) {
    if (req.path.startsWith('/api')) {
      return res.status(400).json({ error: message });
    }
    return res.redirect('/resume');
  }
  console.error('Unhandled error:', err);
  if (req.path.startsWith('/api')) {
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  } else {
    res.status(500).send('Something went wrong. Please try again later.');
  }
});

app.listen(PORT, () => {
  console.log(`Portfolio generator running on http://localhost:${PORT}`);
});

