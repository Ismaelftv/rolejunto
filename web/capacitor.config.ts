import type { CapacitorConfig } from '@capacitor/cli';

// App mobile = o mesmo código do site, empacotado para Android e iOS.
const config: CapacitorConfig = {
  appId: 'br.com.rolejunto.app', // troque pelo identificador definitivo antes de publicar nas lojas
  appName: 'RolêJunto',
  webDir: 'dist',
  backgroundColor: '#FFFFFF',
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
  plugins: {
    SplashScreen: { launchShowDuration: 900, backgroundColor: '#121826', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#FFFFFF', overlaysWebView: false },
  },
};

export default config;
