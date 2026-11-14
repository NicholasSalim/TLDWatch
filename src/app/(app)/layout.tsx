import { AppSidebar } from "@/components/app-sidebar";

/** The app's pages (Home, History, Summaries, Settings) share the sidebar. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col md:flex-row">
      <AppSidebar />
      {/* Clipped sideways so wide glows never scroll the page; "clip" keeps the sidebar sticky. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">{children}</div>
    </div>
  );
}
