import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';

export default function ProposalViewer() {
  const { groupId } = useParams();
  const [requestError, setError] = useState('');
  const error = !groupId ? 'Proposal group is missing.' : requestError;

  useEffect(() => {
    if (!groupId) {
      return;
    }

    api.get(`/groups/${groupId}/proposal-url`)
      .then((res) => {
        window.location.replace(res.data.url);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Unable to open proposal right now.');
      });
  }, [groupId]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="evl-card w-full max-w-md p-8 text-center">
        {!error ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 font-black">
              PDF
            </div>
            <h1 className="text-xl font-black text-text mb-2">Opening Proposal</h1>
            <p className="text-sm text-text/70">Preparing a secure document link...</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4 font-black">
              !
            </div>
            <h1 className="text-xl font-black text-text mb-2">Proposal Unavailable</h1>
            <p className="text-sm text-text/70 mb-6">{error}</p>
            <Link to="/dashboard" className="evl-btn-secondary inline-flex justify-center">
              Back to EvalSys
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
