// Backed by react-native-background-fetch for the periodic deep-scan job,
// with a notifee-managed foreground notification while a scan runs.

export interface DeviceState {
  isCharging: boolean;
  isIdle: boolean;
}

export function canRunDeepScan(state: DeviceState): boolean {
  return state.isCharging && state.isIdle;
}

export async function scheduleDeepScan(): Promise<void> {
  // TODO: react-native-background-fetch configure(), gated by canRunDeepScan()
}

export async function runOnDemandScan(): Promise<void> {
  // TODO: trigger the orchestrator immediately, regex-only path always allowed
}
