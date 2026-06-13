const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const faceRoutes = require('./routes/face');

const app = express();
const PORT = process.env.PORT || 3000;

// Create static asset storage paths
const CAPTURES_DIR = path.join(__dirname, 'captures');
if (!fs.existsSync(CAPTURES_DIR)) {
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

const VISITOR_LOG_DIR = path.join(__dirname, 'visitor-log');
if (!fs.existsSync(VISITOR_LOG_DIR)) {
    fs.mkdirSync(VISITOR_LOG_DIR, { recursive: true });
}

// Global Middlewares
app.use(cors());                  
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Static Routing Engines
app.use('/captures', express.static(CAPTURES_DIR));
app.use('/visitor-log', express.static(VISITOR_LOG_DIR));

// DB Core Engine Initialization
const DB_PATH = path.join(__dirname, './db/face_access.sqlite');
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to database');
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            image_path TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name_snapshot TEXT,
            status TEXT,
            image_filename TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// Primary Endpoint Route Maps
app.use('/api/face', faceRoutes);

app.get('/health', (req, res) => {
    res.json({ status: "Node backend running cleanly" });
});

app.listen(PORT, () => {
    console.log(`Server active on port ${PORT}`);
});