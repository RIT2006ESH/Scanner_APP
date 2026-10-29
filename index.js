import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './Root';
import { name as appName } from './app.json';

// Notifee needs this once. The promise never ends; stopForegroundService() ends the service.
notifee.registerForegroundService(() => new Promise(() => {}));

AppRegistry.registerComponent(appName, () => App);
