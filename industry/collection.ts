// Four daily Vercel Hobby schedules: 00:00, 06:00, 12:00 and 18:00 in UTC+8.
export const COLLECTION = {
  minimumIntervalMinutes: 360,
  utcSchedules: ["0 16 * * *", "0 22 * * *", "0 4 * * *", "0 10 * * *"],
  runSeconds: 240,
  databaseLimitBytes: 350 * 1024 * 1024,
} as const;
