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

/**
 * Returns the current calendar date string in YYYY-MM-DD format for a given timezone.
 * Defaults to 'Africa/Kampala' (EAT, UTC+3).
 */
export function getLocalDateString(date: Date = new Date(), timeZone: string = 'Africa/Kampala'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Formats a YYYY-MM-DD date string into a rich human-readable label (e.g. 'Sunday, 15 November 2026').
 */
export function formatLocalDateLabel(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Extracts the local calendar date (YYYY-MM-DD) of a fixture kickoff in a given timezone.
 */
export function getFixtureLocalDate(utcIsoString: string, timeZone: string = 'Africa/Kampala'): string {
  try {
    const d = new Date(utcIsoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return utcIsoString.slice(0, 10);
  }
}

/**
 * Deterministically checks whether a fixture's kickoff time falls strictly on a given calendar date in that timezone.
 */
export function isFixturePlayingOnLocalDate(
  utcIsoString: string,
  targetDateStr: string,
  timeZone: string = 'Africa/Kampala'
): boolean {
  return getFixtureLocalDate(utcIsoString, timeZone) === targetDateStr;
}

/**
 * Calculates milliseconds remaining until midnight (00:00:00) in the specified timezone.
 */
export function getMsUntilMidnight(now: Date = new Date(), timeZone: string = 'Africa/Kampala'): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    let hour = 0;
    let minute = 0;
    let second = 0;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10) % 24;
      if (p.type === 'minute') minute = parseInt(p.value, 10);
      if (p.type === 'second') second = parseInt(p.value, 10);
    }
    const elapsedSecondsToday = hour * 3600 + minute * 60 + second;
    const remainingSeconds = 86400 - elapsedSecondsToday;
    return Math.max(1000, remainingSeconds * 1000);
  } catch {
    return 3600_000;
  }
}

/**
 * Formats the time remaining until midnight in a concise format (e.g. '17h 00m').
 */
export function formatCountdownToMidnight(now: Date = new Date(), timeZone: string = 'Africa/Kampala'): string {
  const ms = getMsUntilMidnight(now, timeZone);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}
