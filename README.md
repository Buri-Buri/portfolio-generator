Portfolio Generator

A full-stack Node.js application that lets users register, log in, and build a multi-section resume/portfolio. Authenticated users can save progress (persisted in SQLite), return later to edit, upload a profile photo, and download the result as a generated PDF.

Features

- **Authentication**: Email/password signup/login with bcrypt hashing and session-based auth (SQLite-backed store).
- **Resume builder**:
  - Personal details, contact info, bio, profile image (JPG/PNG).
  - Dynamic sections for academic entries, previous projects, social links, and multiple work experiences (add/remove on the fly).
  - Soft/technical skills, optional academic history, work responsibilities.
  - Save progress to continue later; auto-prefills existing data.
- **PDF export**: Generates a clean résumé PDF (with photo, skills, academic/work sections, projects, social links).
- **File uploads**: Multer handles image uploads to `/uploads`.

Tech Stack

| Layer          | Technology                              |
| -------------- | --------------------------------------- |
| Server         | Node.js, Express                        |
| Auth/session   | express-session + connect-sqlite3       |
| Database       | SQLite (via sqlite3)                    |
| Passwords      | bcrypt                                  |
| File uploads   | multer                                  |
| PDF generation | pdfkit                                  |
| Frontend       | Static HTML/CSS/JS served by Express    |

Project Structure

```
G:\portfolio-generator
├── public/            # Static assets (HTML, CSS, client JS, uploads served)
│   ├── index.html     # Landing page w/ session-aware CTA
│   ├── login.html     # Login form hitting /api/login
│   ├── register.html  # Registration form hitting /api/register
│   ├── resume.html    # Dynamic resume builder UI
│   └── css/styles.css # Shared styling + repeatable section UI
├── src/db.js          # SQLite setup & schema creation
├── server.js          # Express app, auth, resume API, PDF generator
├── data/              # SQLite DB + session store files
├── uploads/           # Stored profile photos
├── package.json       # NPM scripts & dependencies
└── README.md          # Project documentation (this file)
```

How It Works

1. **Server & DB initialization**
   - `src/db.js` ensures `data/app.db` exists and defines `users` + `resumes` tables.
   - Additional JSON-friendly columns (`previous_projects`, `social_links`, `job_experiences`, `academic_entries`) are added idempotently for multi-entry sections.

2. **Authentication flow**
   - `/api/register` validates unique email, hashes password, inserts into `users`.
   - `/api/login` validates credentials, stores `userId` + `user` in session.
   - `/api/session` returns `{ authenticated, user }` for front-end checks.
   - `/api/logout` destroys the session.
   - `/resume` page and `/api/resume*` endpoints require authentication (via middleware).

3. **Resume data handling**
   - `/api/resume` (GET) fetches saved data for the logged-in user and normalizes JSON fields.
   - `/api/resume` (POST) accepts multipart form data:
     - Multer stores an optional photo under `/uploads`.
     - JSON strings (projects, socials, academics, experiences) are parsed and saved.
     - A “primary” work entry is mirrored into legacy `company_name`, etc., for backward compatibility.
   - All data is persisted per user; each user has at most one resume row (upsert logic).

4. **PDF export**
   - `/resume/pdf` streams a generated PDF using pdfkit.
   - Includes photo (if uploaded), sections for bio, skills, projects, socials, academics, and each experience entry.

5. **Client-side UI (public/resume.html)**
   - On load, hits `/api/session` → redirects to login if unauthenticated.
   - Fetches `/api/resume`, then:
     - Prefills inputs.
     - Rebuilds repeatable lists (academics, projects, socials, experiences) with an “Add” button and remove controls.
   - On form submit:
     - Validates experiences.
     - Bundles repeatable sections as JSON blobs appended to `FormData`.
     - Sends to `/api/resume`.
   - Includes logout button and “Download PDF” link.

Getting Started

```bash
npm install          # install dependencies
npm run dev          # start with nodemon (or `npm start` for plain node)
# visit http://localhost:3000
```

Environment

Optional environment variables:

| Variable         | Default                       | Purpose                              |
| ---------------- | ----------------------------- | ------------------------------------ |
| `PORT`           | `3000`                        | HTTP server port                     |
| `SESSION_SECRET` | `portfolio-generator-secret`  | Session signing secret               |

API Reference

| Method | Endpoint        | Description                                |
| ------ | --------------- | ------------------------------------------ |
| POST   | `/api/register` | `{ name, email, password }`                |
| POST   | `/api/login`    | `{ email, password }`                      |
| GET    | `/api/session`  | Returns session status/user                |
| POST   | `/api/logout`   | Ends current session                       |
| GET    | `/api/resume`   | Fetch saved resume for logged-in user      |
| POST   | `/api/resume`   | Save resume (multipart form + JSON)        |
| GET    | `/resume/pdf`   | Download PDF (requires login)              |

Development Notes

- **Uploads**: Photos are stored under `/uploads` and served statically.
- **Data safety**: The schema enforces one résumé per user (`user_id UNIQUE`). You can expand to multiple templates by adjusting the schema.
- **Extensibility ideas**:
  - Add client-side validation/preview for PDFs.
  - Support multiple template styles for PDF output.
  - Replace sessions with JWT for stateless deployments.
- **Testing**: Currently no automated tests; run `npm run dev`, exercise the UI, and monitor server logs.



