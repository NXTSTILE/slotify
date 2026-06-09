"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { SALON_TIMEZONE } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  updateGlobalSalonAction,
  deleteGlobalSalonAction,
  deleteGlobalAppointmentAction,
  createGlobalSalonAction,
  createGlobalUserAction,
  createGlobalSalonAccountAction,
} from "@/app/actions/superadmin";
import {
  Shield,
  Building,
  Users,
  CalendarDays,
  Coins,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  UserPlus,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface SuperAdminViewProps {
  currentUserId: string;
  stats: {
    total_users: number;
    total_salons: number;
    total_appointments: number;
    total_revenue: number;
  };
  salons: Array<{
    id: string;
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    owner_id: string;
    owner_email: string;
    created_at: string;
    appointment_count: number;
    revenue: number;
  }>;
  users: Array<{
    id: string;
    email: string;
    is_super_admin: boolean;
    created_at: string;
    salon_name: string | null;
    salon_id: string | null;
  }>;
  appointments: Array<{
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    total_price: number;
    customer_name: string;
    customer_phone: string;
    salon_name: string;
  }>;
}

export function SuperAdminView({
  currentUserId,
  stats,
  salons,
  users,
  appointments,
}: SuperAdminViewProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "salons" | "users" | "appointments">("overview");
  const [isPending, startTransition] = useTransition();

  // Search & Filter States
  const [salonSearch, setSalonSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [apptSearch, setApptSearch] = useState("");
  const [apptFilter, setApptFilter] = useState<string>("all");

  // Modals / Selection States
  const [editingSalon, setEditingSalon] = useState<typeof salons[0] | null>(null);
  const [creatingSalon, setCreatingSalon] = useState<boolean>(false);
  const [creatingUser, setCreatingUser] = useState<boolean>(false);
  const [creatingSalonAccount, setCreatingSalonAccount] = useState<boolean>(false);

  // Create Salon Account Form State
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [newAccountSalonName, setNewAccountSalonName] = useState("");
  const [newAccountPhone, setNewAccountPhone] = useState("");

  // Create User Form State
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  // Edit Salon Form State
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");

  // Create Salon Form State
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Handler helpers
  const handleEditSalonOpen = (salon: typeof salons[0]) => {
    setEditingSalon(salon);
    setEditName(salon.name);
    setEditPhone(salon.phone);
    setEditAddress(salon.address || "");
    setEditCity(salon.city || "");
  };

  const handleEditSalonSave = () => {
    if (!editingSalon) return;
    startTransition(async () => {
      const res = await updateGlobalSalonAction(
        editingSalon.id,
        editName,
        editPhone,
        editAddress,
        editCity
      );
      if (res.success) {
        toast.success(res.message);
        setEditingSalon(null);
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDeleteSalon = (id: string, name: string) => {
    if (!confirm(`Are you absolutely sure you want to delete the salon "${name}"? This action cannot be undone and will delete all associated appointments, services, and customers.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteGlobalSalonAction(id);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleCreateSalon = () => {
    if (!newOwnerId || !newName || !newPhone) {
      toast.error("Please fill in all fields.");
      return;
    }
    startTransition(async () => {
      const res = await createGlobalSalonAction(newOwnerId, newName, newPhone);
      if (res.success) {
        toast.success(res.message);
        setCreatingSalon(false);
        setNewName("");
        setNewPhone("");
        setNewOwnerId("");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleCreateUser = () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (newUserPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const res = await createGlobalUserAction(newUserEmail, newUserPassword);
      if (res.success) {
        toast.success(res.message);
        setCreatingUser(false);
        setNewUserEmail("");
        setNewUserPassword("");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleCreateSalonAccount = () => {
    if (!newAccountEmail || !newAccountPassword || !newAccountSalonName || !newAccountPhone) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (newAccountPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const res = await createGlobalSalonAccountAction(
        newAccountEmail,
        newAccountPassword,
        newAccountSalonName,
        newAccountPhone
      );
      if (res.success) {
        toast.success(res.message);
        setCreatingSalonAccount(false);
        setNewAccountEmail("");
        setNewAccountPassword("");
        setNewAccountSalonName("");
        setNewAccountPhone("");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDeleteAppointment = (id: string) => {
    if (!confirm(`Are you absolutely sure you want to delete this appointment? It will be hidden from the salon owner but the data remains.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteGlobalAppointmentAction(id);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };



  // Filter lists
  const filteredSalons = salons.filter(
    (s) =>
      s.name.toLowerCase().includes(salonSearch.toLowerCase()) ||
      s.owner_email.toLowerCase().includes(salonSearch.toLowerCase()) ||
      (s.city && s.city.toLowerCase().includes(salonSearch.toLowerCase()))
  );

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.salon_name && u.salon_name.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const filteredAppointments = appointments.filter((a) => {
    const matchesSearch =
      a.customer_name.toLowerCase().includes(apptSearch.toLowerCase()) ||
      a.customer_phone.includes(apptSearch) ||
      a.salon_name.toLowerCase().includes(apptSearch.toLowerCase());
    const matchesFilter = apptFilter === "all" || a.status === apptFilter;
    return matchesSearch && matchesFilter;
  });

  // Calculate some overview stats
  const averageTicketPrice =
    stats.total_appointments > 0 ? stats.total_revenue / stats.total_appointments : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-rose-600">
              Platform Overview
            </h1>
            <Badge variant="destructive" className="font-semibold text-xs py-0.5 px-2.5 rounded-full shadow-sm animate-pulse">
              SuperAdmin
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Global metrics, multi-tenant directory, and operational parameters for Nxtstile.
          </p>
        </div>

        {/* Tab triggers */}
        <div className="inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground shadow-sm">
          {(["overview", "salons", "users", "appointments"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:bg-background/50 hover:text-foreground"
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Revenue
            </CardTitle>
            <Coins className="h-4 w-4 text-purple-500 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">₹{stats.total_revenue.toLocaleString()}</div>
            <p className="text-xxs text-muted-foreground mt-0.5">Global platforms sales aggregated</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 to-teal-600" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Salons
            </CardTitle>
            <Building className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.total_salons}</div>
            <p className="text-xxs text-muted-foreground mt-0.5">Active salon tenants onboarded</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-rose-500 to-orange-600" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Bookings
            </CardTitle>
            <CalendarDays className="h-4 w-4 text-rose-500 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.total_appointments}</div>
            <p className="text-xxs text-muted-foreground mt-0.5">Global WhatsApp/Admin bookings</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-cyan-500 to-sky-600" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Average Ticket
            </CardTitle>
            <Users className="h-4 w-4 text-cyan-500 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">₹{averageTicketPrice.toFixed(1)}</div>
            <p className="text-xxs text-muted-foreground mt-0.5">Global average booking value</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tab Views */}
      {activeTab === "overview" && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Diagnostic overview status */}
          <Card className="md:col-span-2 shadow-sm border bg-card/60 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-base font-bold text-foreground">Operational Pulse</CardTitle>
              <CardDescription>Visual operational metrics across all registered active units.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>User / Tenant Ratio</span>
                  <span>
                    {(stats.total_salons > 0 ? stats.total_users / stats.total_salons : 0).toFixed(1)} users/salon
                  </span>
                </div>
                <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        (stats.total_salons / (stats.total_users || 1)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Booking Velocity</span>
                  <span>{stats.total_appointments} total scheduled bookings</span>
                </div>
                <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-pink-400 h-2.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (stats.total_appointments / 500) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Multi-tenant list preview */}
              <div className="pt-2">
                <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">
                  Top Salon revenue leaders
                </h3>
                <div className="space-y-2.5">
                  {salons
                    .slice(0, 3)
                    .map((salon) => (
                      <div
                        key={salon.id}
                        className="flex items-center justify-between text-xs py-2 px-3 bg-muted/40 rounded-lg hover:bg-muted/80 transition-colors"
                      >
                        <span className="font-semibold">{salon.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">{salon.appointment_count} bookings</span>
                          <span className="font-bold text-foreground">₹{salon.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  {salons.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No salons onboarded yet.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border">
            <CardHeader>
              <CardTitle className="text-base font-bold text-foreground">SuperAdmin Guide</CardTitle>
              <CardDescription>Access control tips.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-4">
              <div className="bg-muted/40 p-3 rounded-lg border border-border space-y-1">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" /> Role Privilege Escalation
                </p>
                <p className="text-muted-foreground">
                  You can promote any registered user to Super Admin instantly via the Users tab. Caution: Admins have read/write access to everything.
                </p>
              </div>

              <div className="bg-muted/40 p-3 rounded-lg border border-border space-y-1">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-emerald-500" /> Salon Allocation
                </p>
                <p className="text-muted-foreground">
                  If an owner registers and skips onboarding, you can initialize a Salon for them here directly using their registered User ID.
                </p>
              </div>

              <div className="bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Deletion Warnings
                </p>
                <p className="opacity-90">
                  Deleting a salon or user triggers cascading database truncations. All appointments and client records will be wiped.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Salons Tab */}
      {activeTab === "salons" && (
        <Card className="shadow-sm border">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
            <div>
              <CardTitle className="text-lg font-bold">Salon Directories</CardTitle>
              <CardDescription>Browse, edit metadata, and create direct tenant installations.</CardDescription>
            </div>
            <div className="flex w-full sm:w-auto items-center gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search salons..."
                  value={salonSearch}
                  onChange={(e) => setSalonSearch(e.target.value)}
                  className="pl-9 pr-4 h-9 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <Button size="sm" onClick={() => setCreatingSalonAccount(true)} className="gap-1.5 shadow-sm bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4" /> Create Salon Account
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreatingSalon(true)} className="gap-1.5 shadow-sm">
                <Building className="h-4 w-4" /> Allocate Salon
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="p-3">Salon Info</th>
                  <th className="p-3">Owner Email</th>
                  <th className="p-3">City/Location</th>
                  <th className="p-3 text-center">Bookings</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSalons.map((salon) => (
                  <tr key={salon.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-foreground">{salon.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{salon.phone}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-muted-foreground">{salon.owner_email || "No owner"}</div>
                    </td>
                    <td className="p-3 text-muted-foreground">{salon.city || salon.address || "—"}</td>
                    <td className="p-3 text-center font-semibold text-foreground">
                      {salon.appointment_count}
                    </td>
                    <td className="p-3 text-right font-bold text-foreground">
                      ₹{salon.revenue.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditSalonOpen(salon)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Edit Details"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSalon(salon.id, salon.name)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete Salon"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSalons.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                      No salons match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <Card className="shadow-sm border">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
            <div>
              <CardTitle className="text-lg font-bold">User Registries</CardTitle>
              <CardDescription>Monitor platform registrations, assign privileges, and delete accounts.</CardDescription>
            </div>
            <div className="flex w-full sm:w-auto items-center gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 pr-4 h-9 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <Button size="sm" onClick={() => setCreatingUser(true)} className="gap-1.5 shadow-sm">
                <UserPlus className="h-4 w-4" /> Add User
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="p-3">User Email</th>
                  <th className="p-3">Associated Salon</th>
                  <th className="p-3">Role Status</th>
                  <th className="p-3">Registered At</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        {user.email}
                        {user.id === currentUserId && (
                          <Badge variant="outline" className="text-xxs text-primary py-0 px-1 bg-primary/5 border-primary/20">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-xxs text-muted-foreground font-mono mt-0.5">{user.id}</div>
                    </td>
                    <td className="p-3">
                      {user.salon_name ? (
                        <div className="text-muted-foreground flex items-center gap-1">
                          <Building className="h-3 w-3 text-muted-foreground" />
                          {user.salon_name}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No Salon Installed</span>
                      )}
                    </td>
                    <td className="p-3">
                      {user.is_super_admin ? (
                        <Badge variant="destructive" className="text-xxs font-bold py-0.5 px-2 rounded-full">
                          Platform Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xxs font-semibold py-0.5 px-2 rounded-full">
                          Salon Owner
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {format(toZonedTime(new Date(user.created_at), SALON_TIMEZONE), "yyyy-MM-dd HH:mm")}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-muted-foreground text-xs italic">Read-only</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                      No users match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Appointments Tab */}
      {activeTab === "appointments" && (
        <Card className="shadow-sm border">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
            <div>
              <CardTitle className="text-lg font-bold">Global Bookings Feed</CardTitle>
              <CardDescription>Live real-time feed of all bookings across the SaaS platform.</CardDescription>
            </div>
            <div className="flex flex-wrap w-full sm:w-auto items-center gap-2">
              <select
                value={apptFilter}
                onChange={(e) => setApptFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm font-semibold text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div className="relative flex-1 sm:w-60 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search client or salon..."
                  value={apptSearch}
                  onChange={(e) => setApptSearch(e.target.value)}
                  className="pl-9 pr-4 h-9 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="p-3">Appointment details</th>
                  <th className="p-3">Salon Tenant</th>
                  <th className="p-3">Client details</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAppointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-foreground">
                        {format(toZonedTime(new Date(appt.start_time), SALON_TIMEZONE), "yyyy-MM-dd")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(toZonedTime(new Date(appt.start_time), SALON_TIMEZONE), "hh:mm a")} -{" "}
                        {format(toZonedTime(new Date(appt.end_time), SALON_TIMEZONE), "hh:mm a")}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-primary">{appt.salon_name}</td>
                    <td className="p-3">
                      <div className="font-medium text-foreground">{appt.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{appt.customer_phone}</div>
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant={
                          appt.status === "completed"
                            ? "default"
                            : appt.status === "confirmed"
                            ? "secondary"
                            : appt.status === "cancelled"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-xxs font-bold py-0.5 px-2 rounded-full uppercase tracking-wider"
                      >
                        {appt.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-bold text-foreground">₹{appt.total_price}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteAppointment(appt.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete Appointment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAppointments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                      No appointments matching search filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Edit Salon Modal */}
      {editingSalon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border rounded-xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
              <Building className="h-5 w-5 text-primary" /> Edit Salon Info
            </h2>
            <p className="text-muted-foreground text-xs mb-4">
              Update name, phone number, address, and city for this salon tenant globally.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Salon Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">City</label>
                <input
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => setEditingSalon(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleEditSalonSave} disabled={isPending}>
                {isPending && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Salon Modal */}
      {creatingSalon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border rounded-xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
              <UserPlus className="h-5 w-5 text-emerald-500" /> Allocate Salon
            </h2>
            <p className="text-muted-foreground text-xs mb-4">
              Directly initialize and allocate a new Salon for a user that does not own one yet.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Select Owner</label>
                <select
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">-- Choose User --</option>
                  {users
                    .filter((u) => !u.salon_id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                </select>
                {users.filter((u) => !u.salon_id).length === 0 && (
                  <p className="text-xxs text-destructive mt-1">
                    No users without an active salon installation.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Salon Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vintage Scissors"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Contact Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +91 9988776655"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => setCreatingSalon(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateSalon} disabled={isPending}>
                {isPending && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Initialize Salon
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {creatingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border rounded-xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
              <UserPlus className="h-5 w-5 text-primary" /> Create User
            </h2>
            <p className="text-muted-foreground text-xs mb-4">
              Enter credentials to create a new user account.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Email Address (User ID)</label>
                <input
                  type="email"
                  placeholder="e.g. owner@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => setCreatingUser(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateUser} disabled={isPending}>
                {isPending && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create User
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Salon Account Modal */}
      {creatingSalonAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border rounded-xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
              <Building className="h-5 w-5 text-primary" /> Create Salon Account
            </h2>
            <p className="text-muted-foreground text-xs mb-4">
              Create a new salon owner login and automatically allocate their salon in a single step.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Salon Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vintage Scissors"
                  value={newAccountSalonName}
                  onChange={(e) => setNewAccountSalonName(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Contact Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +91 9988776655"
                  value={newAccountPhone}
                  onChange={(e) => setNewAccountPhone(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Owner Email Address (User ID)</label>
                <input
                  type="email"
                  placeholder="e.g. owner@example.com"
                  value={newAccountEmail}
                  onChange={(e) => setNewAccountEmail(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newAccountPassword}
                  onChange={(e) => setNewAccountPassword(e.target.value)}
                  className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => setCreatingSalonAccount(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateSalonAccount} disabled={isPending}>
                {isPending && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
