import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './Root';
import { name as appName } from './app.json';

// Notifee needs this once. stopForegroundService() ends it.
notifee.registerForegroundService(() => new Promise(() => {}));

AppRegistry.registerComponent(appName, () => App);
