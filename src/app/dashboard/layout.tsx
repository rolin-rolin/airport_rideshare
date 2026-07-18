import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { GroupStatusBar } from "@/components/GroupStatusBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <GroupStatusBar />
      {children}
    </div>
  );
}
