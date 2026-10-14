export type TutorialRole = 'instructor' | 'panel' | 'registration';
export type TutorialAction = 'name' | 'block' | 'members' | 'consent' | 'group';
export interface TutorialStep {
  title: string;
  description: string;
  target?: string;
  route?: string;
  interactive?: boolean;
  action?: TutorialAction;
  missing?: string;
}
export interface TutorialConfig {
  label: string;
  steps: TutorialStep[];
}
const target = (name: string) => '[data-tutorial="' + name + '"]';
const navigation = target('navigation') + ', ' + target('mobile-menu');
export const tutorials: Record<TutorialRole, TutorialConfig> = {
  instructor: {
    label: 'Instructor',
    steps: [
      { title: 'Your instructor workspace', route: '/dashboard', target: target('dashboard-welcome'), description: 'Manage your subjects, student groups, panels and grading from this dashboard. This tour explains the controls without changing your records.' },
      { title: 'Find your tools', target: navigation, route: '/dashboard', description: 'Use the navigation menu for Groups, Sections, Registration Links, Rubrics and Results. On a phone, the menu button opens these tools.' },
      { title: 'Keep subjects separate', route: '/dashboard', target: target('subject-switcher') + ', ' + target('mobile-menu'), description: 'Choose the current subject from the navigation menu. Blocks, groups and results are scoped to that subject, so classes do not get mixed together.' },
      { title: 'Groups and students', route: '/groups', target: target('instructor-groups'), description: 'This list shows groups in the selected subject, their block and member names. Search or filter by block when you have many groups. Registered students appear here after they submit the instructor link.' },
      { title: 'Review project documents', route: '/groups', target: target('group-proposal'), description: 'View Proposal opens the document a group submitted. A No Proposal label means there is no document yet. Edit lets you correct group and member details after checking them with the student.', missing: 'There are no submitted proposal documents to highlight yet. When a group uploads one, its row will show View Proposal. No document is opened by this tour.' },
      { title: 'Controlled registration', route: '/registration-links', target: target('registration-link-form'), description: 'Create a registration link for the current subject, choose its allowed blocks and expiration, then share it with students yourself. The tour does not create or share a link.' },
      { title: 'Blocks and panel assignments', route: '/assign-panels', target: target('assign-panels'), description: 'Assign your panel accounts to the appropriate blocks. Panel members then see only the groups assigned to them. Save assignments only when you intend to change them.' },
      { title: 'Grading rubrics', route: '/rubrics', target: target('rubrics'), description: 'Set the grading criteria and score ranges for this subject. The active rubric is the one panels use when opening a group. This walkthrough does not edit or activate a rubric.' },
      { title: 'Monitor evaluation progress', route: '/results', target: target('results-blocks'), interactive: true, description: 'Choose a block to review its results. Pending or incomplete results identify missing panel evaluations; feedback and averages are shown as submissions arrive. Export controls follow your account permissions.' },
      { title: 'You are ready', description: 'You have explored the instructor workflow. Use Start tutorial whenever you need a refresher. Normal permissions, confirmations and grading locks continue to apply.' },
    ],
  },
  panel: {
    label: 'Panel',
    steps: [
      { title: 'Your panel dashboard', route: '/dashboard', target: target('dashboard-welcome'), description: 'Your dashboard lists your assigned subjects, progress and blocks. Filter by subject to find a group; each group shows its subject and block. Only groups assigned to your panel account are shown.' },
      { title: 'View group members', route: '/dashboard', target: target('panel-dashboard-members'), interactive: true, description: 'Group cards keep member names hidden so your dashboard is easier to scan. Use Show members to check a roster, then Hide members to collapse it. This does not open grading or change group details.', missing: 'No assigned groups are available yet. Once a group appears, its card will include Show members.' },
      { title: 'Panel navigation', route: '/dashboard', target: navigation, description: 'Dashboard gives you an overview. Grade Groups opens your evaluation workspace. On mobile, open the menu with this button.' },
      { title: 'Talk with your panel team', route: '/chat', target: target('panel-chat'), interactive: true, description: 'Panel Chat is a private general conversation for the subject instructor and assigned panel judges. There are no separate group threads, and students cannot read this chat. If you have several panel teams, choose the team at the top. While grading, use the floating message button at the bottom right to open a small conversation without leaving your scores. Minimize it when you need more space, or expand it into this page. Message drafts are kept on this browser; the tour never sends a message. Your submitted scores and student feedback stay in grading.' },
      { title: 'Choose a subject', route: '/grade', target: target('panel-subject'), interactive: true, description: 'Start with the subject you want to evaluate. The block and group lists are separated by subject. You can try changing the subject here.', missing: 'No assigned subjects are available yet. Ask your instructor to assign your panel account to a block.' },
      { title: 'Choose an assigned block', route: '/grade', target: target('panel-blocks'), interactive: true, description: 'Select a block from this subject to see its assigned groups. Switching blocks saves your current unsubmitted draft locally and asks before leaving it.' },
      { title: 'Open a group', route: '/grade', target: target('panel-groups'), interactive: true, action: 'group', description: 'Click an assigned group to continue. Its subject, member details and rubric will load. Submitted, Draft and New labels help you keep track of your work.', missing: 'No assigned groups are available in this block yet. Ask your instructor about your assignment, then replay the tour.' },
      { title: 'Check the group details', route: '/grade', target: target('panel-details'), description: 'Check the group name, subject, block and members before grading. Each group loads its own subject rubric.', missing: 'Select a group from the list to see its details. If none are assigned, your instructor must add the assignment first.' },
      { title: 'Read the proposal', route: '/grade', target: target('panel-proposal'), description: 'View Proposal opens an uploaded document in a separate tab. If the group has not uploaded one, this area says No proposal uploaded. The tutorial never opens documents automatically.' },
      { title: 'Scores and rubric', route: '/grade', target: target('panel-scores'), interactive: true, description: 'Use the instructor rubric and enter a score for every criterion. You may try entering scores: they stay as a local draft until you submit. Locked subjects are read-only.', missing: 'No scoring form is available yet. Select an assigned group with an active rubric; your instructor manages missing rubrics and grading locks.' },
      { title: 'Write constructive feedback', route: '/grade', target: target('panel-feedback'), interactive: true, description: 'Add strengths, suggestions or other feedback here. Comments are optional and are kept with the group evaluation. Drafts are stored only on this device.' },
      { title: 'Submit only when ready', route: '/grade', target: target('panel-submit'), description: 'After finishing this tutorial, use Submit Scores & Feedback or Update Scores & Feedback. Review the confirmation before saving. The tutorial never submits an evaluation.' },
      { title: 'Panel walkthrough complete', description: 'Review the group and rubric before every submission. You can replay this guide from Start tutorial. Unsaved drafts remain on this browser; they are not submitted scores.' },
    ],
  },
  registration: {
    label: 'Group registration',
    steps: [
      { title: 'Register with your instructor link', target: target('registration-intro'), description: 'This is the group registration form, not an account dashboard. Your instructor link supplies the subject and allowed blocks. This guide helps you fill the real form without sending it.' },
      { title: 'Enter your group name', target: target('registration-name'), interactive: true, action: 'name', description: 'Type your group name, or your name for an individual project. Enter a name to unlock Next. Nothing is sent while you type.' },
      { title: 'Verify the subject', target: target('registration-subject'), description: 'The subject comes from your instructor link and cannot be changed here. If it is incorrect, ask for the correct link before continuing.' },
      { title: 'Choose your block', target: target('registration-block'), interactive: true, action: 'block', description: 'Select your assigned block from the available options. Choose a block to continue.' },
      { title: 'Enter the group members', target: target('registration-members'), interactive: true, action: 'members', description: 'Fill in Last Name and First Name for every member. Middle Name is optional. Use + Add Member for another row, or Remove an extra row. One row is enough for an individual registration.' },
      { title: 'Optional project document', target: target('registration-document'), interactive: true, description: 'Choose a proposal if your instructor requires one. Accepted formats are PDF, DOC, DOCX, PPT and PPTX, up to 10 MB. Choosing a file does not upload it until you confirm registration.' },
      { title: 'Read the privacy information', target: target('registration-consent'), interactive: true, action: 'consent', description: 'Read how the information will be used. Check the agreement yourself only if you agree; the tutorial will not check it for you. You can Skip the guide at any time.' },
      { title: 'Review before sending', target: target('registration-form'), description: 'Check the group name, subject, block, every member and any selected document. Back returns to earlier tutorial steps without clearing your entries. Fix any mistake in the form before submission.' },
      { title: 'Your submission is your choice', target: target('registration-submit'), description: 'After finishing the guide, click Complete Registration yourself. The system shows a details confirmation; only Submit Registration in that confirmation sends the registration. No tutorial button submits this form.' },
      { title: 'Ready to register', description: 'You have completed the guide, not the registration. Finish closes the tutorial and leaves your entries ready to review. After a successful confirmed submission, the page shows Registration Successful. There is no student status dashboard; ask your instructor about corrections or feedback.' },
    ],
  },
};

export function actionReady(action?: TutorialAction): boolean {
  const value = (name: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>('[data-tutorial="registration-' + name + '"]')?.value.trim();
  if (action === 'name') return Boolean(value('name'));
  if (action === 'block') return Boolean(value('block'));
  if (action === 'consent') return Boolean(document.querySelector<HTMLInputElement>('[data-tutorial="registration-consent"] input')?.checked);
  if (action === 'members') {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('[data-tutorial="registration-members"] input[required]')];
    return inputs.length > 0 && inputs.every(input => Boolean(input.value.trim()));
  }
  if (action === 'group') {
    const hasGroups = Boolean(document.querySelector('[data-tutorial="panel-groups"] button'));
    return !hasGroups || Boolean(document.querySelector('[data-tutorial="panel-workspace"][data-selected-group]:not([data-selected-group=""])[data-loading="false"]'));
  }
  return true;
}
