import { useState, useEffect } from 'react';
import type { User, Student } from '../types/auth';
import { getStudents, getSections } from '../utils/storage';
import MultiJudgeEvaluation from './MultiJudgeEvaluation';

interface PanelDashboardProps {
  currentUser: User;
  onLogout: () => void;
}

export default function PanelDashboard({ currentUser, onLogout }: PanelDashboardProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [filterSection, setFilterSection] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const allStudents = getStudents();
    setStudents(allStudents);
    
    const allSections = getSections();
    setSections(allSections.map(s => s.name));
  };

  const filteredStudents = filterSection
    ? students.filter(s => s.section === filterSection)
    : students;

  const handleStartEvaluation = (student: Student) => {
    setSelectedStudent(student);
  };

  const handleBackToList = () => {
    setSelectedStudent(null);
    loadData();
  };

  if (selectedStudent) {
    return (
      <div className="panel-dashboard">
        <header className="dashboard-header">
          <div className="header-content">
            <h1>Evaluation Panel</h1>
            <div className="user-info">
              <button onClick={handleBackToList} className="back-btn">← Back to Students</button>
              <span>Panel: {currentUser.fullName}</span>
              <button onClick={onLogout} className="logout-btn">Logout</button>
            </div>
          </div>
        </header>
        <div className="evaluation-container">
          <MultiJudgeEvaluation 
            prefilledStudent={selectedStudent}
            onComplete={handleBackToList}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="panel-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Evaluation Panel</h1>
          <div className="user-info">
            <span>Welcome, {currentUser.fullName}</span>
            <button onClick={onLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </header>

      <div className="dashboard-container">
        <main className="dashboard-content">
          <div className="students-selection">
            <div className="selection-header">
              <h2>Select Student to Evaluate</h2>
              <div className="filter-section">
                <label>Filter by Section:</label>
                <select value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
                  <option value="">All Sections</option>
                  {sections.map(section => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="no-students">
                <p>No students available for evaluation.</p>
                <p>Please contact the administrator.</p>
              </div>
            ) : (
              <div className="students-grid">
                {filteredStudents.map(student => (
                  <div key={student.id} className="student-card">
                    <div className="student-info">
                      <h3>{student.name}</h3>
                      <p className="student-id">ID: {student.studentId}</p>
                      <p className="student-section">Section: {student.section}</p>
                      {student.groupNumber && (
                        <p className="student-group">Group: {student.groupNumber}</p>
                      )}
                    </div>
                    <button 
                      onClick={() => handleStartEvaluation(student)}
                      className="evaluate-btn"
                    >
                      Start Evaluation
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
