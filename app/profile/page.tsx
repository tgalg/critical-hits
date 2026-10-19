import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { getAccount } from "@/lib/profile/service";
import { getCurrentUser } from "@/lib/session";

// The header's Profile link: the static header can't know the username, so
// this sends the player on to their own public profile.
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const account = await getAccount(getDatabase(), user.id);
  if (!account) redirect("/sign-in");
  redirect(`/u/${account.username}`);
}
