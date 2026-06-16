const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const { triggerDoorOpen } = require('../serial.js');

const PYTHON_ENGINE_URL = 'http://localhost:5001';
const DB_PATH = path.join(__dirname, '../db/face_access.sqlite');
const CAPTURES_DIR = path.join(__dirname, '../captures');

const db = new sqlite3.Database(DB_PATH, (err) => {});

function saveCaptureToDisk(base64Str, prefix) {
    try {
        const filename = `${prefix}_${Date.now()}.jpg`;
        const filepath = path.join(CAPTURES_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(base64Str, 'base64'));
        return filename;
    } catch (e) {
        return null;
    }
}

// Stream proxies
router.post('/start-stream', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_ENGINE_URL}/start_feed`);
        res.json({ success: true, message: response.data.message });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.post('/stop-stream', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_ENGINE_URL}/stop_feed`);
        res.json({ success: true, message: response.data.message });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Access logs
router.get('/logs', (req, res) => {
    const sql = `SELECT * FROM access_logs ORDER BY timestamp DESC LIMIT 15`;
    db.all(sql, [], (err, rows) => {
        if (!err) res.json({ success: true, logs: rows });
    });
});

router.delete('/logs/:id', (req, res) => {
    const logId = req.params.id;
    db.get("SELECT image_filename FROM access_logs WHERE id = ?", [logId], (err, row) => {
        if (row && row.image_filename) {
            const filePath = path.join(CAPTURES_DIR, row.image_filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        db.run("DELETE FROM access_logs WHERE id = ?", [logId], () => {
            res.json({ success: true, message: "Log item removed" });
        });
    });
});

// ==========================================
// USER DE-AUTHORIZATION MANAGEMENT ENDPOINTS
// ==========================================
router.get('/users', (req, res) => {
    db.all("SELECT id, name, image_path FROM users ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, users: rows });
    });
});

// ADJUSTED: Now fetches name first and logs status as 'REVOKED'
router.delete('/users/:id', (req, res) => {
    const userId = req.params.id;
    
    // 1. Fetch the user's current identity signature before wiping it
    db.get("SELECT name FROM users WHERE id = ?", [userId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, error: "Identity profile not found." });
        }
        const userName = row.name;

        // 2. Clear credentials from database matrix
        db.run("DELETE FROM users WHERE id = ?", [userId], async function(deleteErr) {
            if (deleteErr) return res.status(500).json({ success: false });

            // 3. Append the 'REVOKED' event trace directly into the security audit ledger
            db.run(
                `INSERT INTO access_logs (user_id, name_snapshot, status, image_filename) 
                 VALUES (NULL, ?, 'REVOKED', NULL)`,
                [userName]
            );

            try {
                // 4. Alert Python engine to retrain models and wipe local image weights
                await axios.post(`${PYTHON_ENGINE_URL}/register`, { user_id: userId, snapshot: null });
                res.json({ success: true, message: `Security clearances revoked for ${userName}.` });
            } catch (e) {
                // Return success even if Python engine connection is temporarily offline
                res.json({ success: true, message: `Clearance dropped locally for ${userName}.` });
            }
        });
    });
});

// ==========================================
// SCAN LOGIC WITHOUT AUTOMATIC DENIALS
// ==========================================
router.post('/scan', async (req, res) => {
    try {
        const response = await axios.post(`${PYTHON_ENGINE_URL}/capture`);
        const data = response.data;

        if (!data.success && !data.face_detected) {
            return res.json({ success: false, message: "No person detected inside viewport layout." });
        }

        if (data.known && data.matched_id) {
            triggerDoorOpen(); 
            db.get("SELECT name FROM users WHERE id = ?", [data.matched_id], (err, row) => {
                const userName = row ? row.name : `User #${data.matched_id}`;
                const savedFile = saveCaptureToDisk(data.snapshot, 'ALLOWED');
                db.run(`INSERT INTO access_logs (user_id, name_snapshot, status, image_filename) VALUES (?, ?, 'ALLOWED', ?)`,
                    [data.matched_id, userName, savedFile]
                );
                return res.json({ success: true, authenticated: true, message: `Approved: ${userName}`, snapshot: data.snapshot });
            });
            return;
        }

        return res.json({ success: true, authenticated: false, snapshot: data.snapshot, message: "Profile footprint unknown." });

    } catch (error) {
        res.status(500).json({ success: false, error: "Core engine response failure" });
    }
});

// Explicit endpoint to run if they cancel or discard the modal registration state
router.post('/log-denied', (req, res) => {
    const { snapshot } = req.body;
    const savedFile = saveCaptureToDisk(snapshot, 'DENIED');
    db.run(`INSERT INTO access_logs (user_id, name_snapshot, status, image_filename) VALUES (NULL, 'Unknown Subject', 'DENIED', ?)`, 
        [savedFile], 
        () => res.json({ success: true })
    );
});

router.post('/enroll', async (req, res) => {
    const { name, snapshot } = req.body;
    db.run("INSERT INTO users (name, image_path) VALUES (?, NULL)", [name], async function(err) {
        const userId = this.lastID;
        try {
            const registerRes = await axios.post(`${PYTHON_ENGINE_URL}/register`, { user_id: userId, snapshot: snapshot });
            if (registerRes.data.registered) {
                triggerDoorOpen();
                const savedFile = saveCaptureToDisk(snapshot, 'ENROLLED');
                db.run(`INSERT INTO access_logs (user_id, name_snapshot, status, image_filename) VALUES (?, ?, 'ENROLLED', ?)`, [userId, name, savedFile]);
                return res.json({ success: true, message: `Successfully enrolled: ${name}!` });
            }
        } catch (e) { res.status(500).json({ error: "Write failed" }); }
    });
});

module.exports = router;