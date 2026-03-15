import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./i18n";
import "./index.css";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { PartyList } from "./pages/PartyList";
import { PartyDetail } from "./pages/PartyDetail";
import { MyParties } from "./pages/MyParties";
import { Profile } from "./pages/Profile";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="parties" element={<PartyList />} />
          <Route path="parties/:partyId" element={<PartyDetail />} />
          <Route path="my-parties" element={<MyParties />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
