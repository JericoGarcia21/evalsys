import { getApiMessage } from '../utils/apiError';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { formatMemberName, type StructuredMember } from '../utils/members';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

interface Subject { _id: string; code: string; title: string; }
interface Section { _id: string; name: string; block: string; subject?: string | Subject; }
const emptyMember = (): StructuredMember => ({ lastName: '', firstName: '', middleName: '' });
const getSectionSubjectId = (section: Section) => (
  typeof section.subject === 'string' ? section.subject : section.subject?._id
);

export default function RegisterGroup() {
  const { token: pathToken } = useParams();
  const [searchParams] = useSearchParams();
  const token = pathToken || searchParams.get('token') || '';
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [form, setForm] = useState({ name: '', subject: '', section: '' });
  const [members, setMembers] = useState<StructuredMember[]>([emptyMember()]);
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requestError, setError] = useState('');
  const error = !token ? 'Registration is closed. Please use the registration link from your instructor.' : requestError;
  const [registrationClosed, setRegistrationClosed] = useState(!token);
  const [expiresAt, setExpiresAt] = useState('');
  const proposalInputRef = useRef<HTMLInputElement | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [isWakingUp, setIsWakingUp] = useState(Boolean(token));

  const addMember = () => setMembers((current) => [...current, emptyMember()]);
  const removeMember = (index: number) => {
    setMembers((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  };
  const updateMember = (index: number, field: keyof StructuredMember, value: string) => {
    setMembers((current) => current.map((member, i) => (
      i === index ? { ...member, [field]: value } : member
    )));
  };
  const clearProposalFile = () => {
    setProposalFile(null);
    if (proposalInputRef.current) proposalInputRef.current.value = '';
  };
  const normalizedMembers = () => members.map((member) => ({
    lastName: member.lastName.trim(),
    firstName: member.firstName.trim(),
    middleName: member.middleName?.trim() || '',
  })).filter((member) => member.lastName || member.firstName || member.middleName);

  useEffect(() => {
    if (!token) {
      return;
    }

    api.get(`/registration-links/public/${token}`)
      .then((res) => {
        setSubjects([res.data.subject]);
        setSections((res.data.sections || []).filter((section: Section) => (
          getSectionSubjectId(section) === res.data.subject?._id
        )));
        setExpiresAt(res.data.expiresAt || '');
        setForm((current) => ({ ...current, subject: res.data.subject?._id || '', section: '' }));
        setRegistrationClosed(false);
        setIsWakingUp(false);
      })
      .catch((err) => {
        setRegistrationClosed(true);
        setError(getApiMessage(err, 'Registration is closed. Please contact your instructor.'));
        setIsWakingUp(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMembers = normalizedMembers();
    if (!cleanMembers.length || cleanMembers.some((member) => !member.lastName || !member.firstName)) {
      setError('Each member must have a last name and first name.');
      return;
    }
    
    if (!form.subject) {
      setError('Registration link is missing its subject.');
      return;
    }

    if (!token) {
      setError('Registration requires a valid instructor link.');
      return;
    }

    if (proposalFile && proposalFile.size > 10 * 1024 * 1024) {
      setError('Proposal file must be 10 MB or smaller.');
      return;
    }

    // Confirmation Dialog
    const selectedSubject = subjects.find(s => s._id === form.subject);
    const selectedBlock = sections.find(s => s._id === form.section)?.block;
    const memberPreview = cleanMembers.map(formatMemberName).join(', ');
    const ok = await confirm({
      title: 'Submit Registration?',
      message: `Please confirm your details:\n\n` +
        `Group/Name: ${form.name}\n` +
        `Subject: ${selectedSubject ? `${selectedSubject.code} - ${selectedSubject.title}` : ''}\n` +
        `Block: ${selectedBlock}\n` +
        `Members: ${memberPreview}\n` +
        `Proposal File: ${proposalFile?.name || 'None'}\n\n` +
        `If you made a mistake after submitting, please contact the person who sent you this form for corrections.`,
      confirmLabel: 'Submit Registration',
    });
    if (!ok) return;

    setLoading(true);
    setError('');
    
    try {
      const payload = new FormData();
      payload.append('name', form.name);
      payload.append('section', form.section);
      payload.append('members', JSON.stringify(cleanMembers));
      if (proposalFile) payload.append('proposalFile', proposalFile);

      await api.post(`/registration-links/public/${token}/register`, payload);
      setSuccess(true);
    } catch (err: unknown) {
      setError(getApiMessage(err, 'Registration failed. Please check your inputs.'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md evl-card p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
            ✓
          </div>
          <h2 className="text-2xl font-black text-text mb-2">Registration Successful!</h2>
          <p className="text-text/70 mb-8">Your group <strong>{form.name}</strong> has been registered. You can now wait for your panel to start the evaluation.</p>
          <button 
            onClick={() => {
              setSuccess(false);
              setForm((current) => ({ ...current, name: '', section: '' }));
              setMembers([emptyMember()]);
              clearProposalFile();
              setAgreedToPrivacy(false);
              setError('');
            }}
            className="evl-btn-primary w-full"
          >
            Register Another Group
          </button>
          <div className="mt-6">
             <Link to="/login" className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">← Return to Login</Link>
          </div>
        </div>
      </div>
    );
  }

  if (registrationClosed) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md evl-card p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-xl font-extrabold mx-auto mb-5">
            E
          </div>
          <h1 className="text-2xl font-black text-text mb-2">Registration Closed</h1>
          <p className="text-sm text-text/70 leading-relaxed mb-6">
            {error || 'Please use the registration link from your instructor.'}
          </p>
          <Link to="/login" className="evl-btn-primary inline-flex justify-center w-full">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 py-10">
      <ConfirmDialog />
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-xl font-extrabold mx-auto mb-4 shadow-lg shadow-primary/20">
            E
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-text tracking-tight mb-2">Group Registration</h1>
          <p className="text-text/65 text-sm font-medium">EvalSys · Automated Rubric Evaluation System</p>
        </div>

        {/* Instructions Card */}
        <div className="evl-card p-5 mb-6 bg-primary/[0.03] border-primary/10">
          <h3 className="text-xs font-extrabold text-primary uppercase tracking-widest mb-3">📋 How to Register</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-[11px] text-text/60 leading-relaxed"><strong className="text-text/80">Group?</strong> Enter your group name and add each member in a separate row.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-[11px] text-text/60 leading-relaxed"><strong className="text-text/80">Individual?</strong> Use one member row with your Last Name and First Name.</p>
            </div>
          </div>
        </div>

        {expiresAt && (
          <div className="mb-6 text-center text-xs font-semibold text-text/65">
            Registration is open until {new Date(expiresAt).toLocaleString()}.
          </div>
        )}

        {/* Form Card */}
        <div className="evl-card overflow-hidden shadow-xl shadow-primary/5">

          {isWakingUp && !error && (
            <div className="bg-primary/10 text-primary text-[11px] font-bold py-2.5 px-4 rounded-lg mb-6 text-center flex items-center justify-center gap-2 animate-pulse">
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
              Initializing system… (Server is waking up)
            </div>
          )}

          {error && (
            <div className="evl-alert-error text-xs py-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Row 1: Name + Subject + Block */}
            <div className="p-6 md:p-8 border-b border-muted/30">
              <div className="mb-5">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Project Details</p>
                <h2 className="text-lg font-extrabold text-text">Choose the subject and block for this group.</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="evl-label block mb-1.5">
                  Group Name / Student Name
                </label>
                <input 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="evl-input !py-3"
                  placeholder="e.g. Group Omega or Juan Dela Cruz" 
                />
              </div>

              <div>
                <label className="evl-label block mb-1.5">Subject</label>
                <select
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value, section: '' })}
                  required
                  disabled
                  className="evl-select !py-3"
                >
                  <option value="">-- Select subject --</option>
                  {subjects.map(subject => (
                    <option key={subject._id} value={subject._id}>{subject.code} - {subject.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="evl-label block mb-1.5">Assigned Block</label>
                <select 
                  value={form.section} 
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  required
                  disabled={!form.subject}
                  className="evl-select !py-3"
                >
                  <option value="">{form.subject ? '-- Select your block --' : '-- Select subject first --'}</option>
                  {sections.map(s => (
                    <option key={s._id} value={s._id}>{s.block}</option>
                  ))}
                </select>
              </div>
              </div>
            </div>

            {/* Row 2: Members */}
            <div className="p-6 md:p-8 border-b border-muted/30 bg-bg/40">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Members</p>
                  <h2 className="text-lg font-extrabold text-text">Enter each member using separate name fields.</h2>
                </div>
                <button
                  type="button"
                  onClick={addMember}
                  className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors"
                >
                  + Add Member
                </button>
              </div>
              <div className="space-y-3">
                {members.map((member, index) => (
                  <div key={index} className="rounded-xl border border-muted/30 bg-bg/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-black text-text/70 uppercase tracking-widest">Member {index + 1}</p>
                      {members.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMember(index)}
                          className="text-[10px] font-black text-danger uppercase tracking-widest hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">Last Name</label>
                        <input
                          value={member.lastName}
                          onChange={(e) => updateMember(index, 'lastName', e.target.value)}
                          required
                          className="evl-input !py-2 !text-sm"
                          placeholder="Garcia"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">First Name</label>
                        <input
                          value={member.firstName}
                          onChange={(e) => updateMember(index, 'firstName', e.target.value)}
                          required
                          className="evl-input !py-2 !text-sm"
                          placeholder="Jerico"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-text/65 uppercase block mb-1">Middle Name</label>
                        <input
                          value={member.middleName}
                          onChange={(e) => updateMember(index, 'middleName', e.target.value)}
                          className="evl-input !py-2 !text-sm"
                          placeholder="Bautista"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-text/60 mt-3 font-medium">Last Name and First Name are required. Middle Name is optional.</p>
            </div>

            <div className="p-6 md:p-8 border-b border-muted/30">
              <div className="mb-4">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Project Document</p>
                <h2 className="text-lg font-extrabold text-text">Upload a proposal or project document if required.</h2>
                <p className="text-xs text-text/70 mt-1 font-medium">
                  Optional. Accepted files: PDF, DOC, DOCX, PPT, PPTX. Maximum size: 10 MB.
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-muted/50 bg-bg/60 p-4">
                <input
                  ref={proposalInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && file.size > 10 * 1024 * 1024) {
                      clearProposalFile();
                      setError('Proposal file must be 10 MB or smaller.');
                      return;
                    }
                    setError('');
                    setProposalFile(file);
                  }}
                  className="block w-full text-sm text-text/80 file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90"
                />
                {proposalFile ? (
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                    <p className="text-sm font-semibold text-text truncate">{proposalFile.name}</p>
                    <button
                      type="button"
                      onClick={clearProposalFile}
                      className="text-xs font-black text-danger uppercase tracking-widest hover:underline self-start sm:self-auto"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-text/65 mt-3 font-medium">No proposal uploaded. You can continue without a file.</p>
                )}
              </div>
            </div>

            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
                <div className="bg-bg/60 p-4 rounded-xl border border-muted/20">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={agreedToPrivacy}
                      onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                      required
                      className="mt-0.5 w-4 h-4 rounded border-muted text-primary focus:ring-primary/30 cursor-pointer"
                    />
                    <span className="text-[11px] text-text/70 leading-relaxed">
                      By registering, you agree that the information provided will be used solely for project evaluation and grading within the <span className="font-bold text-primary">EvalSys Platform</span>.
                    </span>
                  </label>
                </div>

                <button 
                  type="submit" 
                  disabled={loading || !agreedToPrivacy}
                  className={`evl-btn-primary w-full py-4 text-base shadow-lg transition-all ${
                    (!agreedToPrivacy || loading) ? 'opacity-50 grayscale cursor-not-allowed shadow-none' : 'shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0'
                  }`}
                >
                  {loading ? 'Processing...' : 'Complete Registration'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link to="/login" className="text-xs font-bold text-primary hover:underline">← Back to Login</Link>
          <p className="text-text/60 text-[10px] font-medium">
            &copy; 2026 EvalSys · <span className="uppercase tracking-widest">Developed by Jerico B. Garcia</span>
          </p>
        </div>
      </div>
    </div>
  );
}

