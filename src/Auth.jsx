import { useEffect, useRef, useState } from "react";
import App from "./App.jsx";
import Skeleton from "./Skeleton.jsx";

function Login({ onSignIn, connectionError }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-heading">
        <a
          className="brand login-brand"
          href="/"
          aria-label="University of Dubai Sustainable Garden"
        >
          <img src="/brand/ud-seal.png" alt="University of Dubai seal" />
          <span>
            <strong>UNIVERSITY of DUBAI</strong>
            <span lang="ar" dir="rtl">
              جامعة دبي
            </span>
          </span>
        </a>
        <h1 id="login-heading">Sustainable Garden</h1>
        <p className="login-description">
          Sign in to open the garden dashboard.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setError("");
            setBusy(true);
            try {
              await onSignIn(username.trim(), password);
            } catch (failure) {
              setError(failure.message);
            } finally {
              setBusy(false);
              setPassword("");
            }
          }}
          aria-busy={busy}
        >
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={128}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={busy}
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          {(error || connectionError) && (
            <p className="login-error" role="alert">
              {error || connectionError}
            </p>
          )}
          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function Auth() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const checkRequest = useRef(null);
  const authBusy = useRef(false);
  useEffect(() => {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem("garden-theme") === "dark" ? "dark" : "light";
    } catch {}
    const check = async () => {
      if (authBusy.current) return;
      checkRequest.current?.abort();
      const controller = new AbortController();
      checkRequest.current = controller;
      try {
        const response = await fetch("/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setSession(null);
          setError("");
        } else if (response.ok) {
          const current = await response.json();
          if (!controller.signal.aborted) {
            setSession(current);
            setError("");
          }
        } else throw new Error();
      } catch {
        if (!controller.signal.aborted)
          setError("Cannot reach the sign-in service. Please try again.");
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    };
    const expire = () => {
      checkRequest.current?.abort();
      setSession(null);
      setChecking(false);
      setError("Your session ended. Please sign in again.");
    };
    const storage = (event) => {
      if (event.key === "garden-signout") expire();
    };
    check();
    const interval = setInterval(check, 60000);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("garden-session-ended", expire);
    window.addEventListener("storage", storage);
    return () => {
      checkRequest.current?.abort();
      clearInterval(interval);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("garden-session-ended", expire);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        checkRequest.current?.abort();
        setSession(null);
        setError("Your session expired. Please sign in again.");
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  const signIn = async (username, password) => {
    authBusy.current = true;
    checkRequest.current?.abort();
    try {
      let response;
      try {
        response = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new Error("Cannot reach the server. Check your connection.");
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Sign in failed. Please try again.");
      setError("");
      setSession(body);
    } finally {
      authBusy.current = false;
    }
  };
  const signOut = async () => {
    if (signingOut) return;
    authBusy.current = true;
    checkRequest.current?.abort();
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      setSession(null);
      try {
        localStorage.setItem("garden-signout", String(Date.now()));
      } catch {}
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      authBusy.current = false;
      setSigningOut(false);
    }
  };
  if (checking)
    return (
      <main className="login-page">
        <p className="secondary" role="status">
          <Skeleton kind="session" label="Opening dashboard" />
        </p>
      </main>
    );
  if (!session) return <Login onSignIn={signIn} connectionError={error} />;
  return (
    <>
      <App onSignOut={signOut} signingOut={signingOut} />
      {error && (
        <p className="auth-notice" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
