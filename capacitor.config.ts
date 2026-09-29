import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Permanent store identity: change before the first App Store / Play submission.
  appId: 'com.visioneditpro.landscape',
  appName: 'Vision Edit Pro',
  webDir: 'dist',
  backgroundColor: '#101814',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
