import { SuperAdminShell } from "../superadmin-shell";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SuperAdminShell>
      <main className="flex-1 overflow-auto bg-background min-h-screen">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </SuperAdminShell>
  );
}
