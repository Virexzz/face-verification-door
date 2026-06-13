import React, { useState } from 'react';
import axios from 'axios';

function FaceEnrollModal({ snapshot, onDeny, onSuccess, backendUrl }) {
  const [userName, setUserName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setErrorText('An identity trace label string index is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorText('');

    try {
      const response = await axios.post(`${backendUrl}/enroll`, {
        name: userName,
        snapshot: snapshot // Transmits the cached photo to disk
      });

      if (response.data.success) {
        onSuccess(response.data.message);
      } else {
        setErrorText(response.data.error || 'Identity enrollment failed.');
        setIsSubmitting(false);
      }
    } catch (error) {
      setErrorText('Transmission pipeline exception communicating with master Node server.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Enroll Captured Profile</h3>
        <p>This captured image signature does not exist in our system. Save database record?</p>
        
        <div className="snapshot-frame">
          <img 
            src={`data:image/jpeg;base64,${snapshot}`} 
            alt="Manual Snapshot Capture" 
          />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Assign Identity Tag Name:</label>
            <input 
              type="text" 
              placeholder="e.g. Marcus Vance"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {errorText && <p className="error-text">{errorText}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-deny" onClick={onDeny} disabled={isSubmitting}>
              Discard Profile
            </button>
            <button type="submit" className="btn btn-allow" disabled={isSubmitting}>
              {isSubmitting ? 'Writing Entry...' : 'Allow & Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FaceEnrollModal;