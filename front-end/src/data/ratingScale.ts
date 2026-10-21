export const percentageLevels = () => [
  { label: 'Excellent', percentage: 100, description: 'Complete, accurate, well-executed, and meets all requirements.' },
  { label: 'Very Good', percentage: 90, description: 'Meets requirements with only minor errors or omissions.' },
  { label: 'Good', percentage: 80, description: 'Meets most basic requirements but has some errors or omissions.' },
  { label: 'Needs Improvement', percentage: 70, description: 'Partially complete or contains significant errors.' },
  { label: 'Not Submitted / Not Demonstrated', percentage: 0, description: 'Required output is missing or cannot be evaluated.' },
].map(level => ({ ...level, minScore: 0, maxScore: 0 }));

export const ratingPoints = (weight: number, percentage: number) => Math.round(weight * percentage) / 100;
