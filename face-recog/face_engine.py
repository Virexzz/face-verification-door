import os
import cv2
import sqlite3
import base64
import numpy as np
import time
import threading
from flask import Flask, jsonify, request, Response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

FACES_DIR = "face-log"
os.makedirs(FACES_DIR, exist_ok=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, "../backend/db/face_access.sqlite"))

cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
recognizer = cv2.face.LBPHFaceRecognizer_create()
is_trained = False
CONFIDENCE_THRESHOLD = 55.0

video_cap = None
current_frame = None
frame_lock = threading.Lock()
cam_thread = None
is_feed_running = False

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def train_recognizer():
    global is_trained
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            image_path TEXT
        )
    ''')
    conn.commit()
    rows = conn.execute("SELECT id, image_path FROM users WHERE image_path IS NOT NULL").fetchall()
    conn.close()

    faces, labels = [], []
    for row in rows:
        img = cv2.imread(row["image_path"], cv2.IMREAD_GRAYSCALE)
        if img is not None:
            faces.append(img)
            labels.append(row["id"])

    if faces:
        recognizer.train(faces, np.array(labels))
        is_trained = True

def camera_worker():
    global video_cap, current_frame, is_feed_running
    
    print("[SYSTEM] Initializing camera interface...")
    video_cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not video_cap.isOpened():
        video_cap = cv2.VideoCapture(0)
        
    time.sleep(0.4)
    video_cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    video_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    while is_feed_running:
        ret, frame = video_cap.read()
        if not ret or frame is None or frame.size == 0:
            time.sleep(0.02)
            continue

        with frame_lock:
            current_frame = frame.copy()
            
        time.sleep(0.03)

    if video_cap is not None:
        video_cap.release()
        video_cap = None
    with frame_lock:
        current_frame = None
    print("[SYSTEM] Camera hardware safely de-allocated.")

def generate_video_stream():
    global current_frame, is_feed_running
    while is_feed_running:
        with frame_lock:
            if current_frame is None:
                time.sleep(0.05)
                continue
            ret, encoded_jpeg = cv2.imencode('.jpg', current_frame)
            if not ret:
                continue
            frame_bytes = encoded_jpeg.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n\r\n')
        time.sleep(0.04)

@app.route("/start_feed", methods=["POST"])
def start_feed():
    global is_feed_running, cam_thread
    if not is_feed_running:
        is_feed_running = True
        cam_thread = threading.Thread(target=camera_worker, daemon=True)
        cam_thread.start()
        return jsonify({"success": True, "message": "Camera hardware initialized."})
    return jsonify({"success": True, "message": "Feed already running."})

@app.route("/stop_feed", methods=["POST"])
def stop_feed():
    global is_feed_running
    is_feed_running = False
    return jsonify({"success": True, "message": "Camera hardware released safely."})

@app.route("/video_feed")
def video_feed():
    if not is_feed_running:
        blank_canvas = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank_canvas, "Camera Lens Power Off", (210, 240), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 2)
        _, encoded_jpeg = cv2.imencode('.jpg', blank_canvas)
        return Response(encoded_jpeg.tobytes(), mimetype='image/jpeg')
    return Response(generate_video_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/capture", methods=["POST"])
def capture():
    global current_frame
    with frame_lock:
        if current_frame is None:
            return jsonify({"error": "Camera offline"}), 400
        frame_snapshot = current_frame.copy()

    gray = cv2.cvtColor(frame_snapshot, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(80, 80))

    if len(faces) == 0:
        return jsonify({"face_detected": False}), 200

    x, y, w, h = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
    face_roi = cv2.resize(gray[y:y+h, x:x+w], (200, 200))

    matched_id, confidence = -1, 999.0
    if is_trained:
        matched_id, confidence = recognizer.predict(face_roi)

    known = is_trained and confidence <= CONFIDENCE_THRESHOLD

    cv2.rectangle(frame_snapshot, (x, y), (x + w, y + h), (0, 255, 0), 4)
    _, buffer = cv2.imencode('.jpg', frame_snapshot)
    marked_b64 = base64.b64encode(buffer).decode('utf-8')

    return jsonify({
        "face_detected": True,
        "snapshot": marked_b64,
        "known": known,
        "matched_id": int(matched_id) if known else None,
    }), 200

@app.route("/register", methods=["POST"])
def register():
    data = request.json
    user_id = data["user_id"]
    img_b64 = data["snapshot"]

    img_bytes = base64.b64decode(img_b64)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    faces = cascade.detectMultiScale(gray, 1.1, 6, minSize=(80, 80))
    if len(faces) == 0:
        return jsonify({"error": "No face found inside registration snapshot"}), 400

    x, y, w, h = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)[0]
    face_roi = cv2.resize(gray[y:y+h, x:x+w], (200, 200))

    path = f"{FACES_DIR}/user_{user_id}.png"
    cv2.imwrite(path, face_roi)

    conn = get_db()
    conn.execute("UPDATE users SET image_path=? WHERE id=?", (path, user_id))
    conn.commit()
    conn.close()

    train_recognizer()  
    return jsonify({"registered": True}), 200

if __name__ == "__main__":
    train_recognizer()  
    app.run(port=5001, debug=False, host='0.0.0.0')