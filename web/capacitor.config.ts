import type { CapacitorConfig } from '@capacitor/cli';

// App mobile = o mesmo código do site, empacotado para Android e iOS.
const config: CapacitorConfig = {
  appId: 'br.com.rolejunto.app', // troque pelo identificador definitivo antes de publicar nas lojas
  appName: 'RolêJunto',
  webDir: 'dist',
  backgroundColor: '#121826',
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, launchAutoHide: true, launchFadeOutDuration: 250, backgroundColor: '#121826', androidScaleType: 'CENTER_CROP', showSpinner: false, splashFullScreen: false, splashImmersive: false },
    StatusBar: { style: 'DARK', backgroundColor: '#121826', overlaysWebView: false },
  },
};

export default config;
