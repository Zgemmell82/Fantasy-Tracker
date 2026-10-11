// Features that are built but switched off. Turn one on by building with its variable set to 1
// (for example VITE_FEATURE_RADIO=1 npm run build), or in the deploy workflow's build step.

// Hot Route Radio: the live two-host show on the Hot Route tab. Off for now; the voice work comes later.
export const RADIO_ENABLED = import.meta.env.VITE_FEATURE_RADIO === '1';
