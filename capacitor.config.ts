import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.formready.app',
  appName: 'FormReady',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Camera: {
      // No cloud-photo-library integrations; camera/gallery access stays on-device.
    },
  },
}

export default config
