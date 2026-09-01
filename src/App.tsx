import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SettingsProvider } from "./context/SettingsContext";
import { Shell } from "./components/Shell";
import { StudentsList } from "./pages/StudentsList";
import { StudentDetail } from "./pages/StudentDetail";
import { TopicsList } from "./pages/TopicsList";
import { TopicDetail } from "./pages/TopicDetail";
import { TemplatesList } from "./pages/TemplatesList";
import { TemplateDetail } from "./pages/TemplateDetail";
import { ResourcesPage } from "./pages/ResourcesPage";
import { ResourceDetail } from "./pages/ResourceDetail";
import { ImportWizard } from "./pages/ImportWizard";

export default function App() {
  return (
    <SettingsProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Navigate to="/students" replace />} />
            <Route path="/students" element={<StudentsList />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/topics" element={<TopicsList />} />
            <Route path="/topics/:id" element={<TopicDetail />} />
            <Route path="/templates" element={<TemplatesList />} />
            <Route path="/templates/:id" element={<TemplateDetail />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/resources/:id" element={<ResourceDetail />} />
            <Route path="/import" element={<ImportWizard />} />
          </Route>
        </Routes>
      </HashRouter>
    </SettingsProvider>
  );
}
