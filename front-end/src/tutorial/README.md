# Live onboarding tutorials

The shared TutorialProvider lives inside BrowserRouter and AuthProvider, above Routes. It owns a Driver.js instance and keeps the current step across page navigation. CSS animations provide the highlight, floating cards and transitions; reduced-motion disables them. No Motion/GSAP dependency is required.

## Roles and actual features

- Instructor = authenticated admin role. Its tour visits dashboard, Groups, Registration Links, Assign Panels, Rubrics and Results.
- Panel = authenticated panel role. Its tour visits dashboard and Grade Groups, with subject/block/group selection and actual scoring controls.
- Registration = valid public instructor registration form. Students have no account or dashboard in this application. Closed/invalid links get no guide.
- Superadmin has no Instructor tour because its tools and permissions differ.

Existing ProtectedRoute and API permissions remain the access controls. Tutorials do not grant permissions.

## Add or edit a step

1. Add a stable data-tutorial attribute to the actual element. Avoid CSS class names, translated text and table positions as selectors.
2. Edit the appropriate configuration in tours.ts: title, description, target, and optional route. Write only about implemented features.
3. Set interactive: true only for controls that the user may safely use during the guide. Other targets are read-only during the step.
4. For required practice, add an action type and a pure DOM check in actionReady. Never invoke a form handler, click a submit button, call a mutation API, or insert student/evaluation records from tutorial code.
5. Add missing copy for optional or empty features. Targets are observed for up to eight seconds before a centered explanation is shown. No assignment or rubric is fabricated.
6. Run npm run build, npm run lint, and npm run test:e2e -- --grep tutorial using the isolated synthetic browser fixture.

## Storage and replay

localStorage keys are evalsys_tutorial_v1:ROLE:USER_ID for authenticated users, and evalsys_tutorial_v1:registration:anonymous-browser for public registration. Records track completed, dismissed, and step. Only finishing the last step sets completed. Skip and Maybe later stop automatic invitations; Start tutorial replays from the beginning. An interrupted, undismissed invitation can resume its saved step.

Completion is per account and role on the current browser, not synchronized between devices. Anonymous students cannot be reliably identified per user; they share the current browser's registration-guide preference. No instructor-link token, password, score or registration details are stored in tutorial records. Change the prefix version if a future tutorial needs a new first-visit offer.

## Safety and accessibility

During an active guide, a capturing submit listener prevents both submission-button actions and Enter-key form submissions. Finish/Skip removes it. Real registration and evaluation confirmations still apply afterward. Tutorial controls do not call mutation endpoints. Fields remain real inputs, so registration entries survive Finish and panel edits follow the existing local draft behavior.

Driver.js supplies the dimmed overlay, cutout and scrolling. The controller provides Next, Back, Skip, Finish, progress, keyboard navigation, a focus cycle including interactive target controls, reduced-motion support and dynamically rendered target waits. Arrow shortcuts do not override typing in inputs/selects/textareas. Esc skips; existing confirmation dialogs keep priority when switching panel drafts.

Browser tests in test/tutorials.spec.ts cover role isolation, multipage progression, replay/completion, mobile keyboard/reduced motion, live form interaction and zero registration/evaluation POST requests during tutorials.
