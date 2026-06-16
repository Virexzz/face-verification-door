import React, { useState } from 'react';
import axios from 'axios';

function FaceEnrollModal({ snapshot, onDeny, onSuccess, backendUrl }) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorText('Identifier parameter field required.');
      return;
    }
    setIsSubmitting(true);
    setErrorText('');

    try {
      const response = await axios.post(`${backendUrl}/enroll`, {
        name: name.trim(),
        snapshot: snapshot
      });

      if (response.data.success) {
        onSuccess(response.data.message);
      } else {
        setErrorText('Core engine registration write failure.');
        setIsSubmitting(false);
      }
    } catch (err) {
      setErrorText('Network tracking drop during handshake.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="hud-modal-overlay">
      <div className="hud-modal-box">
        <div className="hud-modal-header">
          <div className="hud-scanner-line"></div>
          <h2>⚠️ IDENTITY PROFILE CAPTURE</h2>
          <span className="hud-sub">SECURE PORTAL ENROLLMENT PHASE</span>
        </div>

        <div className="hud-modal-body">
          <div className="hud-preview-pane">
            <img src={`data:image/jpeg;base64,${snapshot}`} alt="Trace Snapshot" />
            <div className="hud-corner tl"></div>
            <div className="hud-corner tr"></div>
            <div className="hud-corner bl"></div>
            <div className="hud-corner br"></div>
          </div>

          <form onSubmit={handleSubmit} className="hud-enroll-form">
            <label>ASSIGN IDENTITY SIGNATURE</label>
            <input 
              type="text" 
              placeholder="e.g. John Doe / Subject Alpha" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
            
            {errorText && <div className="hud-error-msg">⚡ {errorText}</div>}

            <div className="hud-action-row">
              <button 
                type="submit" 
                className="btn-hud btn-hud-confirm" 
                disabled={isSubmitting}
              >
                {isSubmitting ? 'ENROLLING...' : 'AUTHORIZE ENTRY'}
              </button>
              <button 
                type="button" 
                className="btn-hud btn-hud-cancel" 
                onClick={onDeny} 
                disabled={isSubmitting}
              >
                DISCARD & DENY
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default FaceEnrollModal;