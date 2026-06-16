import React, { useState, useEffect } from 'react';
import axios from 'axios';
import FaceEnrollModal from './components/FaceEnrollModal';
import './App.css';

const BACKEND_URL = 'http://localhost:3000/api/face';
const SERVER_BASE = 'http://localhost:3000';
const PYTHON_STREAM_URL = 'http://localhost:5001/video_feed';

function App() {
  const [scanStatus, setScanStatus] = useState('Offline');
  const [systemMessage, setSystemMessage] = useState('Camera system is offline. Boot the feed to begin.');
  const [isFeedActive, setIsFeedActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingSnapshot, setPendingSnapshot] = useState(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [authorizedUsers, setAuthorizedUsers] = useState([]); // New tracking matrix

  const fetchDashboardData = async () => {
    try {
      const logsResponse = await axios.get(`${BACKEND_URL}/logs`);
      if (logsResponse.data.success) {
        setActivityLogs(logsResponse.data.logs);
      }
      
      const usersResponse = await axios.get(`${BACKEND_URL}/users`);
      if (usersResponse.data.success) {
        setAuthorizedUsers(usersResponse.data.users);
      }
    } catch (err) {}
  };

  const deleteLogItem = async (id) => {
    const confirmed = window.confirm("Are you sure you want to delete this log entry?");
    if (!confirmed) return;
    try {
      await axios.delete(`${BACKEND_URL}/logs/${id}`);
      fetchDashboardData();
    } catch (err) {}
  };

  // ==========================================
  // NEW: DE-AUTHORIZE AND WIPE CLEARENCE
  // ==========================================
  const revokeAccessClearance = async (id, name) => {
    const confirmed = window.confirm(`REVOKE SECURITY STATUS: Are you sure you want to completely block and remove access authorization for ${name}?`);
    if (!confirmed) return;

    try {
      const res = await axios.delete(`${BACKEND_URL}/users/${id}`);
      if (res.data.success) {
        setSystemMessage(`Access keys and token maps dropped for: ${name}`);
        fetchDashboardData();
      }
    } catch (err) {
      setSystemMessage("Failed to execute clearance sweep.");
    }
  };

  // ==========================================
  // FIX: HANDLE CANCEL MODAL EXPLICIT DENY LOG
  // ==========================================
  const handleCancelRegistration = async () => {
    try {
      await axios.post(`${BACKEND_URL}/log-denied`, { snapshot: pendingSnapshot });
    } catch (e) {}
    setShowEnrollModal(false);
    setPendingSnapshot(null);
    setScanStatus('Live Video Active');
    setSystemMessage("Access denied. Log entry recorded from discarded registration.");
    fetchDashboardData();
  };

  useEffect(() => {
    fetchDashboardData();
    const syncInterval = setInterval(fetchDashboardData, 4000);
    return () => clearInterval(syncInterval);
  }, []);

  const handleStartFeed = async () => {
    try {
      await axios.post(`${BACKEND_URL}/start-stream`);
      setIsFeedActive(true);
      setScanStatus('Live Video Active');
      setSystemMessage('Continuous video active. Camera hardware claimed by system.');
    } catch (err) { setSystemMessage('Failed to initialize engine camera hardware.'); }
  };

  const handleStopFeed = async () => {
    try {
      await axios.post(`${BACKEND_URL}/stop-stream`);
      setIsFeedActive(false);
      setScanStatus('Offline');
      setSystemMessage('Camera system offline. Hardware released safely.');
    } catch (err) { setSystemMessage('Failed to cleanly shut down engine camera hardware.'); }
  };

  const verifyCurrentFace = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setScanStatus('Capturing Snapshot...');

    try {
      const response = await axios.post(`${BACKEND_URL}/scan`);
      const data = response.data;
      fetchDashboardData();

      if (!data.success) {
        setSystemMessage(data.message);
        setScanStatus('Live Video Active');
        return;
      }

      if (data.authenticated) {
        setSystemMessage(data.message);
        setScanStatus('Authorized Member');
      } else {
        setScanStatus('Registration Required');
        setSystemMessage('Unknown identity trace inside viewport layout.');
        setPendingSnapshot(data.snapshot);
        setShowEnrollModal(true);
      }
    } catch (error) {
      setSystemMessage('Backend engine handshake dropped.');
      setScanStatus('Live Video Active');
    } finally { setIsAnalyzing(false); }
  };

  return (
    <div className="app-container">
      <header className="dashboard-header">
        <div className="logo-section">
          <span className="live-dot animate-pulse"></span>
          <h1>PROJECT-RAC // Security Control Center</h1>
        </div>
        <div className="system-clock">System Node Active</div>
      </header>

      <main className="dashboard-layout">
        <div className="layout-left-column">
          <div className="video-viewport">
            {isFeedActive ? (
              <img src={`${PYTHON_STREAM_URL}?t=${Date.now()}`} alt="Live Feed" className="live-video-element" />
            ) : (
              <div className="video-offline-placeholder">
                <div className="offline-icon">⚠️</div>
                <p>VIDEO FEED SYSTEM OFFLINE</p>
              </div>
            )}
            <div className={`camera-status-tag ${isFeedActive ? 'status-active' : 'status-inactive'}`}>
              {scanStatus}
            </div>
          </div>

          <div className="control-card command-panel">
            <div className="panel-info">
              <h3>System Operational Logging</h3>
              <div className="system-message-box">{systemMessage}</div>
            </div>
            
            <div className="button-group">
              {!isFeedActive ? (
                <button className="btn btn-start" onClick={handleStartFeed}>Power On Camera Feed</button>
              ) : (
                <>
                  <button className="btn btn-allow" onClick={verifyCurrentFace} disabled={isAnalyzing}>
                    {isAnalyzing ? 'Processing...' : 'Verify Current Face'}
                  </button>
                  <button className="btn btn-stop" onClick={handleStopFeed}>Power Off Feed</button>
                </>
              )}
            </div>
          </div>

          {/* NEW MODULE: CLEARANCE AUTHORIZED MANAGEMENT LIST */}
          <div className="control-card user-management-panel">
            <div className="panel-header">
              <h3>Authorized Identity Matrix</h3>
              <span className="count-badge">{authorizedUsers.length} Active Profiles</span>
            </div>
            <div className="users-scroller">
              {authorizedUsers.length === 0 ? (
                <div className="empty-state"><p>No identities enrolled in access logs.</p></div>
              ) : (
                <div className="user-clearance-grid">
                  {authorizedUsers.map(user => (
                    <div key={user.id} className="user-clearance-card">
                      <span className="user-clearance-name">{user.name}</span>
                      <button 
                        className="btn-revoke" 
                        onClick={() => revokeAccessClearance(user.id, user.name)}
                      >
                        Revoke Clearances
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="control-card log-feed-panel">
          <div className="panel-header">
            <h3>System Audit Log Feed</h3>
            <span className="count-badge">{activityLogs.length} Entries</span>
          </div>
          <div className="logs-scroller">
            {activityLogs.length === 0 ? (
              <div className="empty-state"><p>No transactions registered inside registers.</p></div>
            ) : (
              activityLogs.map((log) => (
                <div key={log.id} className={`log-item-row status-${log.status.toLowerCase()}`}>
                  <div className="log-thumbnail-wrapper">
                    {log.image_filename ? (
                      <img src={`${SERVER_BASE}/captures/${log.image_filename}`} alt="Snapshot" className="log-item-thumbnail" />
                    ) : ( <div className="fallback-thumbnail">N/A</div> )}
                  </div>
                  <div className="log-item-details">
                    <div className="log-row-top">
                      <span className="log-user-name">{log.name_snapshot}</span>
                      <span className={`status-badge badge-${log.status.toLowerCase()}`}>{log.status}</span>
                    </div>
                    <div className="log-row-bottom">
                      <span className="log-timestamp">
                        {new Date(log.timestamp).toLocaleTimeString()} - {new Date(log.timestamp).toLocaleDateString()}
                      </span>
                      <button className="btn-delete-log" onClick={() => deleteLogItem(log.id)}>Remove</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {showEnrollModal && (
        <FaceEnrollModal 
          snapshot={pendingSnapshot}
          onDeny={handleCancelRegistration} // Integrated fixed cancellation hook
          onSuccess={(msg) => {
            setShowEnrollModal(false);
            setScanStatus('Live Video Active');
            setSystemMessage(msg);
            fetchDashboardData();
          }}
          backendUrl={BACKEND_URL}
        />
      )}
    </div>
  );
}

export default App;