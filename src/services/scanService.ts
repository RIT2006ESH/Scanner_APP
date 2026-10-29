import notifee, { AndroidForegroundServiceType, AndroidImportance } from '@notifee/react-native';

const CHANNEL_ID = 'scan-progress';

// An ongoing notification keeps Android from killing a long scan in the background.
export async function startScanService(): Promise<void> {
  try {
    await notifee.requestPermission();
    const channelId = await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Scan progress',
      importance: AndroidImportance.LOW,
    });
    await notifee.displayNotification({
      id: 'scan',
      title: 'SentinelScan',
      body: 'Scanning files on this device...',
      android: {
        channelId,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
        pressAction: { id: 'default' },
      },
    });
  } catch (error) {
    console.warn('Could not start the scan notification: ' + String(error));
  }
}

export async function stopScanService(): Promise<void> {
  try {
    await notifee.stopForegroundService();
    await notifee.cancelNotification('scan');
  } catch (error) {
    console.warn('Could not stop the scan notification: ' + String(error));
  }
}
