import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, ListChecks, Target, LogOut } from "lucide-react";
import { Button } from "./ui/button";

const NAV = [
  { to: "/", label: "Review Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/tasks", label: "Task Management", icon: ListChecks, testid: "nav-tasks" },
  { to: "/goals", label: "Targets & Goals", icon: Target, testid: "nav-goals" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-[#FAFAFA]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-zinc-200 flex flex-col fixed h-screen">
        <div className="px-5 py-6 border-b border-zinc-100">
          <img src="/logo.png" alt="The Social Chutney Co." className="h-14 w-auto object-contain" data-testid="brand-logo" />
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-zinc-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate" data-testid="current-user-name">
                {user?.name}
              </p>
              <p className="text-xs text-zinc-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            data-testid="logout-button"
            className="w-full rounded-none border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 ml-64 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
