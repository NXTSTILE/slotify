import { create } from "zustand";

/** Client-side dashboard UI state (sidebar badge uses server data + realtime refresh). */
type DashboardStore = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));
