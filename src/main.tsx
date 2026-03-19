import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import "./lib/logger"; // Initialize global error handlers early
import "./i18n";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { PartyList } from "./pages/PartyList";
import { PartyDetail } from "./pages/PartyDetail";
import { CreateParty } from "./pages/CreateParty";
import { MyParties } from "./pages/MyParties";
import { Profile } from "./pages/Profile";

try {
  console.info("[Tokuten] React mounting…");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="parties" element={<PartyList />} />
                <Route path="parties/:partyId" element={<PartyDetail />} />
                <Route path="create-party" element={<CreateParty />} />
                <Route path="my-parties" element={<MyParties />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  console.info("[Tokuten] React mounted successfully");
} catch (err) {
  console.error("[Tokuten] Fatal: React failed to mount", err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif">
      <div style="text-align:center;max-width:400px;padding:2rem">
        <h2 style="font-size:18px;font-weight:bold;margin-bottom:8px">Something went wrong</h2>
        <p style="font-size:14px;color:#6b7280;margin-bottom:8px">The app failed to start.</p>
        <pre style="font-size:12px;color:#dc2626;text-align:left;background:#f9fafb;padding:12px;border-radius:8px;overflow:auto;max-height:200px">${
          err instanceof Error ? err.message + "\n" + err.stack : String(err)
        }</pre>
        <button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer">Reload</button>
      </div>
    </div>`;
  }
}
