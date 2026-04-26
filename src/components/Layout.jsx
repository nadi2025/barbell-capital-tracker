import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard, TrendingUp, Wallet, Building2, FileText, Landmark,
  Menu, X, LogOut, ChevronRight, DollarSign, Bitcoin, Activity, Users, CreditCard, Layers, Zap, TrendingDown, Settings, RefreshCw, Upload, ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/mobile/BottomNav";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import RouteTransition from "@/components/mobile/RouteTransition";
import PriceHub from "@/components/PriceHub";

const offChainNav = [
{ path: "/", label: "Dashboard", icon: LayoutDashboard },
{ path: "/options", label: "Options Trades", icon: TrendingUp },
{ path: "/stocks", label: "Stock Positions", icon: Building2 },
{ path: "/deposits", label: "Deposits", icon: Wallet },
{ path: "/reports", label: "Reports", icon: FileText },
{ path: "/debt", label: "Debt & Capital", icon: Landmark },
{ path: "/offchain-investors", label: "Investors (Off-Chain)", icon: Users },
{ path: "/weekly-report", label: "דוח שבועי", icon: FileText },
{ path: "/ib-import", label: "ייבוא IB (שבועי)", icon: Upload },
{ path: "/ib-reconcile", label: "IB Reconcile (מלא)", icon: RefreshCw }];


const onChainNav = [
{ path: "/crypto", label: "Crypto Dashboard", icon: Bitcoin },
{ path: "/crypto/wallets", label: "Wallets & Assets", icon: Wallet },
{ path: "/crypto/leveraged", label: "Leveraged Positions", icon: Layers },
{ path: "/crypto/debt", label: "Debt & Interest", icon: CreditCard },
{ path: "/crypto/investors", label: "Investors", icon: Users },
{ path: "/crypto/activity", label: "Activity Log", icon: FileText },
{ path: "/crypto/aave", label: "Aave Account", icon: Zap },
{ path: "/crypto/options", label: "Options", icon: TrendingDown }];


const settingsNav = [
{ path: "/settings/assets", label: "ניהול נכסים", icon: Settings }];


const navItems = [
...offChainNav, ...onChainNav];


const ROOT_PATHS = ["/", "/crypto", "/options", "/stocks", "/settings/assets"];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [priceHubOpen, setPriceHubOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isRootPath = ROOT_PATHS.includes(location.pathname);

  // Page title from nav
  const currentNav = [...offChainNav, ...onChainNav, ...settingsNav].find(
    (n) => n.path === location.pathname
  );
  const pageTitle = currentNav?.label || "Oasis";

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // PriceHub is the single price-update entry point in the app. Every
  // child page can open it through Outlet context — no more page-level
  // refresh buttons calling deleted Deno functions.
  const openPriceHub = () => setPriceHubOpen(true);

  const handleDeleteAccount = async () => {
    try {
      // Delete the user account via API, then logout
      await base44.entities.User.delete(user?.id);
    } catch (_) {}
    try {
      await base44.auth.logout();
    } catch (_) {}
  };

  const isAdmin = user?.role === "admin";
  const isPartner = user?.role === "partner";
  const isInvestor = user?.role === "investor";

  const filteredNav = navItems.filter((item) => {
    if (isInvestor) return item.path === "/" || item.path === "/reports";
    return true;
  });

  return (
    <div className="flex h-screen overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Mobile overlay */}
      {sidebarOpen &&
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      }

      {/* Sidebar (desktop) */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-sidebar border-r border-sidebar-border
        flex flex-col transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <DollarSign className="w-7 h-7 text-primary mr-2" />
          <span className="text-sidebar-foreground text-lg font-semibold tracking-tight">Company tracker</span>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 mb-1 mt-1">Off-Chain</p>
          <div className="space-y-0.5 mb-4">
            {offChainNav.filter((item) => isInvestor ? item.path === "/" || item.path === "/reports" : true).map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 select-none
                    ${isActive ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </Link>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-orange-400/70 uppercase tracking-wider px-3 mb-1">On-Chain · קריפטו</p>
          <div className="space-y-0.5">
            {onChainNav.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 select-none
                    ${isActive ? "bg-orange-500/15 text-orange-400" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </Link>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 mb-1 mt-4">הגדרות</p>
          <div className="space-y-0.5">
            {settingsNav.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 select-none
                    ${isActive ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User info + Delete Account */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold select-none">
              {user?.full_name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role || "admin"}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => base44.auth.logout()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors select-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account
            </button>
          ) : (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2 space-y-2">
              <p className="text-xs text-destructive font-medium">Are you sure? This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={handleDeleteAccount} className="flex-1 py-1 rounded bg-destructive text-destructive-foreground text-xs font-medium select-none">Delete</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-1 rounded bg-muted text-muted-foreground text-xs select-none">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — desktop: icon + update button; mobile: back/menu + title */}
        <header
          className="flex-shrink-0 h-14 flex items-center px-4 lg:px-8 border-b border-border bg-background/80 backdrop-blur-sm"
          style={{ paddingLeft: "calc(1rem + env(safe-area-inset-left))", paddingRight: "calc(1rem + env(safe-area-inset-right))" }}
        >
          {/* Mobile: back on sub-routes, menu on root */}
          <div className="lg:hidden mr-2">
            {isRootPath ? (
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Mobile: page title */}
          <span className="lg:hidden text-sm font-semibold truncate flex-1 select-none">{pageTitle}</span>

          {/* Desktop: spacer */}
          <div className="hidden lg:flex flex-1" />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={openPriceHub}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">עדכן מחירים</span>
          </Button>
        </header>

        {/* Scrollable content with pull-to-refresh */}
        <PullToRefresh onRefresh={() => window.location.reload()}>
          <main
            className="p-4 lg:p-6"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom) + 56px)" }}
          >
            <RouteTransition>
              {/* Outlet context exposes openPriceHub to every child page so
                  page-level refresh buttons can open the modal centrally. */}
              <Outlet context={{ openPriceHub }} />
            </RouteTransition>
          </main>
        </PullToRefresh>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* PriceHub — the single price-update modal for the whole app */}
      <PriceHub open={priceHubOpen} onClose={() => setPriceHubOpen(false)} />
    </div>
  );
}