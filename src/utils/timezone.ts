/**
 * Timezone utilities
 * Platform default timezone: Africa/Kampala (EAT, UTC+3)
 * All timestamps are stored and transmitted in UTC ISO-8601 strings.
 */

export const SUPPORTED_TIMEZONES = [
  { label: 'Kampala (EAT, UTC+3) - Default', value: 'Africa/Kampala' },
  { label: 'UTC / GMT (UTC+0)', value: 'UTC' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Nairobi (EAT, UTC+3)', value: 'Africa/Nairobi' },
  { label: 'Lagos / Abuja (WAT, UTC+1)', value: 'Africa/Lagos' },
  { label: 'Johannesburg (SAST, UTC+2)', value: 'Africa/Johannesburg' },
  { label: 'Cairo (EET, UTC+2)', value: 'Africa/Cairo' },
  { label: 'Paris / Berlin (CET, UTC+1)', value: 'Europe/Paris' },
  { label: 'New York (EDT/EST)', value: 'America/New_York' },
];

export function formatFixtureTime(
  utcIsoString: string, 
  timeZone: string = 'Africa/Kampala',
  includeDate: boolean = true
): string {
  try {
    const date = new Date(utcIsoString);
    if (isNaN(date.getTime())) return 'TBD';

    const options: Intl.DateTimeFormatOptions = {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };

    if (includeDate) {
      options.weekday = 'short';
      options.day = 'numeric';
      options.month = 'short';
    }

    return new Intl.DateTimeFormat('en-GB', options).format(date);
  } catch (error) {
    return utcIsoString;
  }
}

export function formatTimeAgo(utcIsoString: string): string {
  try {
    const diffMs = Date.now() - new Date(utcIsoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recent';
  }
}
