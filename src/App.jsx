import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Sun,
  Moon,
  LayoutGrid,
  Cctv,
  Box,
  X,
  Columns3,
  LogOut,
  Droplets,
  Sprout,
} from "lucide-react";
import { useReadings } from "./data.js";
import { Headline, Solar, WindPanel, RainPanel, AirPanel } from "./Weather.jsx";
import History from "./History.jsx";
import Cameras from "./Cameras.jsx";
import ReadingPage from "./Sensors.jsx";
import Skeleton from "./Skeleton.jsx";
import Assistant from "./Assistant.jsx";
import WaterPage from "./Water.jsx";
import PlantsPage from "./Plants.jsx";
const Home = lazy(() => import("./Home.jsx"));
const pages = {
  home: "Digital garden",
  water: "Air moisture & plant demand",
  plants: "Plant size",
  overview: "Current readings",
  readings: "Reading & history",
  cameras: "Garden CCTV",
};
const currentPage = () => {
  const route = location.hash.replace("#/", "");
  if (["history", "reading", "columnar"].includes(route)) return "readings";
  return Object.hasOwn(pages, route) ? route : "home";
};

export default function App({ onSignOut, signingOut }) {
  const data = useReadings();
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("garden-theme") === "dark";
    } catch {
      return false;
    }
  });
  const [page, setPage] = useState(currentPage);
  const [metric, setMetric] = useState(null);
  const dialog = useRef(null);
  useEffect(() => {
    const changed = () => {
      setPage(currentPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("garden-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  useEffect(() => {
    if (metric && !dialog.current.open) dialog.current.showModal();
  }, [metric]);
  const navigate = (target) => {
    location.hash = `/${target}`;
  };
  const showHistory = (key) => setMetric(key);
  return (
    <>
      <a
        className="skip-link"
        href="#page-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("page-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="#/home">
          <img src="/brand/ud-seal.png" alt="University of Dubai seal" />
          <span>
            <strong>UNIVERSITY of DUBAI</strong>
            <span lang="ar" dir="rtl">
              جامعة دبي
            </span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {[
            ["home", "Home", Box],
            ["water", "Water", Droplets],
            ["plants", "Plants", Sprout],
            ["overview", "Overview", LayoutGrid],
            ["readings", "Reading", Columns3],
            ["cameras", "CCTV", Cctv],
          ].map(([id, label, Icon]) => (
            <a
              key={id}
              href={`#/${id}`}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.5} />
              {label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          {onSignOut && (
            <button
              className="icon-button"
              onClick={onSignOut}
              disabled={signingOut}
              aria-label={signingOut ? "Signing out" : "Sign out"}
              title="Sign out"
            >
              <LogOut size={18} strokeWidth={1.5} />
            </button>
          )}
          <button
            className="icon-button theme-button"
            onClick={() => setDark((v) => !v)}
            aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      <main id="page-content" tabIndex={-1} className={`page-${page}`}>
        <div className={`page-intro${page === "plants" ? " hidden-intro" : ""}`}>
          <h1>
            Sustainable Garden{" "}
            <span className="page-name">/ {pages[page]}</span>
          </h1>
        </div>
        {data.error && (
          <div className="error-message">
            <p>{data.error}</p>
            <button className="quiet-button" onClick={data.retry}>
              Reconnect
            </button>
          </div>
        )}
        {page === "home" && (
          <Suspense
            fallback={<Skeleton kind="scene" label="Loading garden view" />}
          >
            <Home
              entities={data.entities}
              dark={dark}
              onHistory={showHistory}
              onCameras={() => navigate("cameras")}
            />
          </Suspense>
        )}
        {page === "water" && (
          <WaterPage entities={data.entities} onHistory={showHistory} />
        )}
        {page === "plants" && <PlantsPage />}
        {page === "overview" && !data.fetchedAt && !data.error ? (
          <Skeleton kind="overview" />
        ) : (
          page === "overview" && (
            <>
              <div className="weather-grid">
                <Headline entities={data.entities} onHistory={showHistory} />
                <Solar entities={data.entities} onHistory={showHistory} />
                <WindPanel entities={data.entities} onHistory={showHistory} />
                <RainPanel entities={data.entities} onHistory={showHistory} />
                <AirPanel entities={data.entities} onHistory={showHistory} />
              </div>
            </>
          )
        )}
        {page === "readings" && !data.fetchedAt && !data.error ? (
          <Skeleton />
        ) : (
          page === "readings" && (
            <ReadingPage entities={data.entities} onSelect={showHistory} />
          )
        )}
        {page === "cameras" && <Cameras />}
        {page !== "home" && page !== "plants" && (
          <footer className="page-footer">
            <span>University of Dubai · Sustainable Garden</span>
            <span>All times in Dubai · UTC+4</span>
          </footer>
        )}
      </main>
      <dialog
        ref={dialog}
        className="history-dialog"
        aria-label="Sensor history"
        onClose={() => setMetric(null)}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <button
          className="icon-button close-history"
          aria-label="Close sensor history"
          onClick={() => dialog.current.close()}
        >
          <X size={20} />
        </button>
        {metric && (
          <History
            metricKey={metric}
            setMetricKey={setMetric}
            grafanaUrl={data.grafanaUrl}
          />
        )}
      </dialog>
      <Assistant />
    </>
  );
}
