import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, TrendingUp, Bitcoin, Settings } from "lucide-react";

const tabs = [
{ path: "/", label: "Dashboard", icon: LayoutDashboard },
{ path: "/options", label: "Options", icon: TrendingUp },
{ path: "/crypto", label: "Crypto", icon: Bitcoin },
{ path: "/settings/assets", label: "Settings", icon: Settings }];


export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      
      {tabs.map(({ path, label, icon: Icon }) => {
        const isActive =
        path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
        return (
          <button
            key={path}
            onClick={() => navigate(path)} className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 select-none transition-colors text-primary hidden">





            
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>);

      })}
    </nav>);

}