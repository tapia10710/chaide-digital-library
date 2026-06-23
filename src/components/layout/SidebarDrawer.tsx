import React, { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  BookOpen,
  Settings,
} from "lucide-react";
import { getCategoryIconComponent } from "../../lib/categoryIconRegistry";

function CategoryIcon({ icon, imageUrl }: { icon?: string, imageUrl?: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="w-5 h-5 object-contain" />;
  }
  const Icon = getCategoryIconComponent(icon || "Tag");
  return <Icon className="w-5 h-5" />;
}

export default function SidebarDrawer() {
  const { isSidebarOpen, setSidebarOpen, toggleSidebar, categories, role } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile, setSidebarOpen]);

  return (
    <>
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[90] backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`library-sidebar ${
          isSidebarOpen ? "is-expanded" : "is-collapsed"
        } ${isMobile && isSidebarOpen ? "is-open" : ""}`}
      >
        <nav className="sidebar-nav">
          <a
            className={`sidebar-item ${
              location.pathname === "/" ? "is-active" : ""
            }`}
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            <Home />
            <span>Inicio</span>
          </a>

          <a
            className={`sidebar-item ${
              location.pathname === "/catalogos" ? "is-active" : ""
            }`}
            href="/catalogos"
            onClick={(e) => {
              e.preventDefault();
              navigate("/catalogos");
            }}
          >
            <BookOpen />
            <span>Catálogos</span>
          </a>

          {role === 'admin' && (
            <>
              <div className={`sidebar-section-header px-6 mt-6 mb-2 transition-opacity duration-200 ${!isSidebarOpen ? "opacity-0 h-0 my-0 overflow-hidden" : "opacity-100"}`}>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#111]/30">Panel de Control</span>
              </div>
              <a
                className={`sidebar-item ${
                  location.pathname === "/admin" ? "is-active" : ""
                }`}
                href="/admin"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/admin");
                }}
              >
                <Settings />
                <span>Administración</span>
              </a>
              <div className={`h-px bg-black/[0.04] mx-6 my-4 transition-all ${!isSidebarOpen ? "opacity-0 my-0" : "opacity-100"}`} />
            </>
          )}

          {categories
            .filter((category) => category.active !== false)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((category) => (
              <a
                key={category.id}
                className={`sidebar-item ${
                  location.pathname === `/categoria/${category.slug}`
                    ? "is-active"
                    : ""
                }`}
                href={`/categoria/${category.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/categoria/${category.slug}`);
                }}
              >
                <CategoryIcon icon={category.icon} imageUrl={category.imageUrl} />
                <span>{category.name}</span>
              </a>
            ))}
        </nav>
      </aside>
    </>
  );
}
