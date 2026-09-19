import { Route, Routes } from 'react-router';
import PublicLayout from './layouts/PublicLayout.jsx';
import HomePage from './pages/public/HomePage.jsx';
import StatusPage from './pages/public/StatusPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="status" element={<StatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
