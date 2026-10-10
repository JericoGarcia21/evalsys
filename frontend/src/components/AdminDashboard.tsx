import { useState, useEffect } from 'react';
import type { User, Student, Section } from '../types/auth';
import { getUsers, saveUser, deleteUser, getStudents, saveStudent, deleteStudent, getSections, saveSection, deleteSection, getEvaluations } from '../utils/storage';
import type { EvaluationResult } from '../types/rubric';

interface AdminDashboardProps {
  currentUser: User;
  onLogout: () => void;
}

type TabType = 'overview' | 'users' | 'students' | 'sections' | 'results';

export default function AdminDashboard({ currentUser, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([]);

  // User form
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({
    id: '',
    username: '',
    password: '',
    fullName: '',
    email: '',
    role: 'panel' as 'admin' | 'panel'
  });

  // Student form
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [studentForm, setStudentForm] = useState({
    id: '',
    studentId: '',
    name: '',
    section: '',
    groupNumber: ''
  });

  // Section form
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionForm, setSectionForm] = useState({
    id: '',
    name: '',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setUsers(getUsers());
    setStudents(getStudents());
    setSections(getSections());
    setEvaluations(getEvaluations());
  };

  // User Management
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: User = {
      id: userForm.id || Date.now().toString(),
      username: userForm.username,
      password: userForm.password,
      fullName: userForm.fullName,
      email: userForm.email,
      role: userForm.role,
      createdAt: new Date()
    };
    saveUser(newUser);
    setShowUserForm(false);
    resetUserForm();
    loadData();
  };

  const handleDeleteUser = (userId: string) => {
    if (userId === currentUser.id) {
      alert('Cannot delete your own account');
      return;
    }
    if (confirm('Are you sure you want to delete this user?')) {
      deleteUser(userId);
      loadData();
    }
  };

  const resetUserForm = () => {
    setUserForm({
      id: '',
      username: '',
      password: '',
      fullName: '',
      email: '',
      role: 'panel'
    });
  };

  // Student Management
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const newStudent: Student = {
      id: studentForm.id || Date.now().toString(),
      studentId: studentForm.studentId,
      name: studentForm.name,
      section: studentForm.section,
      groupNumber: studentForm.groupNumber || undefined,
      createdAt: new Date()
    };
    saveStudent(newStudent);
    setShowStudentForm(false);
    resetStudentForm();
    loadData();
  };

  const handleDeleteStudent = (studentId: string) => {
    if (confirm('Are you sure you want to delete this student?')) {
      deleteStudent(studentId);
      loadData();
    }
  };

  const resetStudentForm = () => {
    setStudentForm({
      id: '',
      studentId: '',
      name: '',
      section: '',
      groupNumber: ''
    });
  };

  // Section Management
  const handleSaveSection = (e: React.FormEvent) => {
    e.preventDefault();
    const newSection: Section = {
      id: sectionForm.id || Date.now().toString(),
      name: sectionForm.name,
      description: sectionForm.description || undefined,
      createdAt: new Date()
    };
    saveSection(newSection);
    setShowSectionForm(false);
    resetSectionForm();
    loadData();
  };

  const handleDeleteSection = (sectionId: string) => {
    if (confirm('Are you sure you want to delete this section?')) {
      deleteSection(sectionId);
      loadData();
    }
  };

  const resetSectionForm = () => {
    setSectionForm({
      id: '',
      name: '',
      description: ''
    });
  };

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Admin Dashboard</h1>
          <div className="user-info">
            <span>Welcome, {currentUser.fullName}</span>
            <button onClick={onLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </header>

      <div className="dashboard-container">
        <nav className="dashboard-nav">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            📊 Overview
          </button>
          <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
            👥 Panel Accounts
          </button>
          <button className={activeTab === 'sections' ? 'active' : ''} onClick={() => setActiveTab('sections')}>
            📚 Sections/Blocks
          </button>
          <button className={activeTab === 'students' ? 'active' : ''} onClick={() => setActiveTab('students')}>
            🎓 Students
          </button>
          <button className={activeTab === 'results' ? 'active' : ''} onClick={() => setActiveTab('results')}>
            📈 Results
          </button>
        </nav>

        <main className="dashboard-content">
          {activeTab === 'overview' && (
            <div className="overview-tab">
              <h2>System Overview</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>{users.length}</h3>
                  <p>Total Users</p>
                </div>
                <div className="stat-card">
                  <h3>{users.filter(u => u.role === 'panel').length}</h3>
                  <p>Panel Accounts</p>
                </div>
                <div className="stat-card">
                  <h3>{sections.length}</h3>
                  <p>Sections/Blocks</p>
                </div>
                <div className="stat-card">
                  <h3>{students.length}</h3>
                  <p>Students</p>
                </div>
                <div className="stat-card">
                  <h3>{evaluations.length}</h3>
                  <p>Evaluations</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="users-tab">
              <div className="tab-header">
                <h2>Panel Accounts Management</h2>
                <button onClick={() => setShowUserForm(true)} className="add-btn">+ Add Panel Account</button>
              </div>

              {showUserForm && (
                <div className="modal">
                  <div className="modal-content">
                    <h3>{userForm.id ? 'Edit' : 'Add'} Panel Account</h3>
                    <form onSubmit={handleSaveUser}>
                      <div className="form-group">
                        <label>Username *</label>
                        <input
                          type="text"
                          value={userForm.username}
                          onChange={(e) => setUserForm({...userForm, username: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Password *</label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Full Name *</label>
                        <input
                          type="text"
                          value={userForm.fullName}
                          onChange={(e) => setUserForm({...userForm, fullName: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Email</label>
                        <input
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                        />
                      </div>
                      <div className="form-group">
                        <label>Role *</label>
                        <select
                          value={userForm.role}
                          onChange={(e) => setUserForm({...userForm, role: e.target.value as 'admin' | 'panel'})}
                        >
                          <option value="panel">Panel</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="form-actions">
                        <button type="submit" className="save-btn">Save</button>
                        <button type="button" onClick={() => { setShowUserForm(false); resetUserForm(); }} className="cancel-btn">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.fullName}</td>
                      <td>{user.email || '-'}</td>
                      <td><span className={`role-badge ${user.role}`}>{user.role}</span></td>
                      <td>
                        <button onClick={() => handleDeleteUser(user.id)} className="delete-btn">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'sections' && (
            <div className="sections-tab">
              <div className="tab-header">
                <h2>Sections/Blocks Management</h2>
                <button onClick={() => setShowSectionForm(true)} className="add-btn">+ Add Section</button>
              </div>

              {showSectionForm && (
                <div className="modal">
                  <div className="modal-content">
                    <h3>{sectionForm.id ? 'Edit' : 'Add'} Section</h3>
                    <form onSubmit={handleSaveSection}>
                      <div className="form-group">
                        <label>Section Name *</label>
                        <input
                          type="text"
                          value={sectionForm.name}
                          onChange={(e) => setSectionForm({...sectionForm, name: e.target.value})}
                          placeholder="e.g., Block A, Section 1"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          value={sectionForm.description}
                          onChange={(e) => setSectionForm({...sectionForm, description: e.target.value})}
                          placeholder="Optional description"
                          rows={3}
                        />
                      </div>
                      <div className="form-actions">
                        <button type="submit" className="save-btn">Save</button>
                        <button type="button" onClick={() => { setShowSectionForm(false); resetSectionForm(); }} className="cancel-btn">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Section Name</th>
                    <th>Description</th>
                    <th>Students</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(section => (
                    <tr key={section.id}>
                      <td><strong>{section.name}</strong></td>
                      <td>{section.description || '-'}</td>
                      <td>{students.filter(s => s.section === section.name).length}</td>
                      <td>
                        <button onClick={() => handleDeleteSection(section.id)} className="delete-btn">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'students' && (
            <div className="students-tab">
              <div className="tab-header">
                <h2>Students Management</h2>
                <button onClick={() => setShowStudentForm(true)} className="add-btn">+ Add Student</button>
              </div>

              {showStudentForm && (
                <div className="modal">
                  <div className="modal-content">
                    <h3>{studentForm.id ? 'Edit' : 'Add'} Student</h3>
                    <form onSubmit={handleSaveStudent}>
                      <div className="form-group">
                        <label>Student ID *</label>
                        <input
                          type="text"
                          value={studentForm.studentId}
                          onChange={(e) => setStudentForm({...studentForm, studentId: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Name *</label>
                        <input
                          type="text"
                          value={studentForm.name}
                          onChange={(e) => setStudentForm({...studentForm, name: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Section *</label>
                        <select
                          value={studentForm.section}
                          onChange={(e) => setStudentForm({...studentForm, section: e.target.value})}
                          required
                        >
                          <option value="">Select Section</option>
                          {sections.map(section => (
                            <option key={section.id} value={section.name}>{section.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Group Number</label>
                        <input
                          type="text"
                          value={studentForm.groupNumber}
                          onChange={(e) => setStudentForm({...studentForm, groupNumber: e.target.value})}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="form-actions">
                        <button type="submit" className="save-btn">Save</button>
                        <button type="button" onClick={() => { setShowStudentForm(false); resetStudentForm(); }} className="cancel-btn">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Section</th>
                    <th>Group</th>
                    <th>Evaluations</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr key={student.id}>
                      <td>{student.studentId}</td>
                      <td>{student.name}</td>
                      <td>{student.section}</td>
                      <td>{student.groupNumber || '-'}</td>
                      <td>{evaluations.filter(e => e.studentId === student.studentId).length}</td>
                      <td>
                        <button onClick={() => handleDeleteStudent(student.id)} className="delete-btn">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'results' && (
            <div className="results-tab">
              <h2>Evaluation Results</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Student Name</th>
                    <th>Judges</th>
                    <th>Final Score</th>
                    <th>Date</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((evaluation, idx) => (
                    <tr key={idx}>
                      <td>{evaluation.studentId}</td>
                      <td>{evaluation.studentName}</td>
                      <td>{evaluation.judges.length}</td>
                      <td><strong>{evaluation.finalScore.toFixed(2)}</strong> / 100</td>
                      <td>{new Date(evaluation.timestamp).toLocaleDateString()}</td>
                      <td>
                        <button className="view-btn" onClick={() => alert(JSON.stringify(evaluation, null, 2))}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
