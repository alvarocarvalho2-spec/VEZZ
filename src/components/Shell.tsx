import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Search,
  Users,
  Building2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { db } from "../../js/lib/db.js";
import { toast } from "../../js/lib/ui.js";
import Bot from "./Bot";
import type { Session } from "../types";

export function dashboard(session: Session | null) {
  return session?.role === "gestor"
    ? "/gestor"
    : session?.role === "admin"
      ? "/admin-vezz"
      : "/paciente";
}

export function Header({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location]);
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 20);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  async function logout() {
    try {
      await db().signOut();
      toast("Sessão encerrada.", "ok");
      window.location.hash = "#/";
    } catch {
      toast("Não foi possível sair. Tente novamente.", "danger");
    }
  }
  const links = (
    <>
      <NavLink to="/clinicas">Encontrar clínicas</NavLink>
      <NavLink to="/como-funciona">Como funciona</NavLink>
      {session ? (
        <NavLink to={dashboard(session)}>Meu painel</NavLink>
      ) : (
        <NavLink to="/solicitar-clinica">Para clínicas</NavLink>
      )}
    </>
  );
  return (
    <header className={`v-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="v-container v-header-inner">
        <Link to="/" className="v-brand" aria-label="VEZZ início">
          <Bot />
          <span>VEZZ</span>
        </Link>
        <nav className="v-desktop-nav" aria-label="Principal">
          {links}
        </nav>
        <div className="v-header-actions">
          {session ? (
            <>
              <Link className="v-user" to={dashboard(session)}>
                <span>{session.nome.slice(0, 1)}</span>
                {session.nome.split(" ")[0]}
              </Link>
              <button className="v-icon-btn" onClick={logout} aria-label="Sair">
                <LogOut size={19} />
              </button>
            </>
          ) : (
            <>
              <Link className="v-login" to="/login">
                Entrar
              </Link>
              <Link className="v-button v-button-small" to="/cadastro">
                Começar agora <ArrowUpRight size={16} />
              </Link>
            </>
          )}
          <button
            ref={button}
            className="v-icon-btn v-menu-toggle"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-controls="v-mobile-menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="v-mobile-menu"
            className="v-mobile-menu"
            aria-label="Navegação móvel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {links}
            {!session && (
              <Link to="/cadastro">
                Criar minha conta <ChevronRight size={18} />
              </Link>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="v-footer">
      <div className="v-container">
        <div className="v-footer-top">
          <div>
            <Link to="/" className="v-brand" aria-label="VEZZ início">
              <Bot expression="joy" />
              <span>VEZZ</span>
            </Link>
            <p>Seu tempo merece cuidado.</p>
          </div>
          <nav aria-label="Rodapé">
            <Link to="/clinicas">Encontrar clínicas</Link>
            <Link to="/como-funciona">Como funciona</Link>
            <Link to="/solicitar-clinica">Cadastre sua clínica</Link>
            <Link to="/login">Acessar minha conta</Link>
          </nav>
        </div>
        <div className="v-footer-bottom">
          <span>© {new Date().getFullYear()} VEZZ</span>
          <span>De Fortaleza, para cuidar melhor.</span>
          <a
            href="#app"
            onClick={(event) => {
              event.preventDefault();
              window.scrollTo({
                top: 0,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
          >
            Voltar ao topo ↑
          </a>
        </div>
      </div>
    </footer>
  );
}

export function BottomNav({ session }: { session: Session | null }) {
  if (!session || session.role === "admin") return null;
  const items =
    session.role === "gestor"
      ? ([
          ["/gestor", "Painel", LayoutDashboard],
          ["/gestor/fila", "Fila", ListOrdered],
          ["/gestor/consultas", "Agenda", CalendarDays],
          ["/gestor/pacientes", "Pacientes", Users],
          ["/gestor/clinica", "Clínica", Building2],
        ] as const)
      : ([
          ["/paciente", "Início", LayoutDashboard],
          ["/clinicas", "Clínicas", Search],
          ["/paciente/fila", "Minha fila", ListOrdered],
          ["/paciente/historico", "Histórico", CalendarDays],
        ] as const);
  return (
    <nav className="v-bottom-nav" aria-label="Atalhos do painel">
      {items.map(([path, label, Icon]) => (
        <NavLink key={path} to={path} end>
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
