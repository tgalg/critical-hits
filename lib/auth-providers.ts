// Read on the server so pages can show only the sign-in options that work.
export function isDiscordEnabled() {
  return !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET;
}
