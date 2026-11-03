import { copy } from '../../ui/copy.ts';

export const settingsSections = [
  { id: 'profile', title: copy.settingsProfile, detail: copy.x8ProfileDetail },
  { id: 'training', title: copy.settingsTraining, detail: copy.x8TrainingDetail },
  { id: 'appearance', title: copy.x8Appearance, detail: copy.x8AppearanceDetail },
  { id: 'privacy', title: copy.x8Privacy, detail: copy.x8PrivacyDetail },
  { id: 'crew', title: copy.settingsCrew, detail: copy.x8CrewDetail },
  { id: 'account', title: copy.settingsAccount, detail: copy.x8AccountDetail },
] as const;
