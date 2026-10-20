import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, SiteLayout } from './components/Layouts';
import { RequireAuth, Toasts } from './components/ui';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Profile from './pages/Profile';
import Checkout from './pages/Checkout';
import Bookings from './pages/Bookings';
import Messages from './pages/Messages';
import Account from './pages/Account';
import { Login, Signup } from './pages/Auth';
import Verify from './pages/Verify';
import PartnerDashboard from './pages/PartnerDashboard';
import Admin from './pages/Admin';
import BecomePartner from './pages/BecomePartner';
import { Guidelines, Privacy, Safety, Terms } from './pages/Legal';
import NotFound from './pages/NotFound';
import BrandPage from './pages/BrandPage';
import ForgotPassword from './pages/ForgotPassword';
import Notifications from './pages/Notifications';
import BookingDetail from './pages/BookingDetail';
import Payment from './pages/Payment';
import EditProfile from './pages/EditProfile';
import Help from './pages/Help';
import Blocked from './pages/Blocked';
import ConfirmEmail from './pages/ConfirmEmail';
import { CookieBar, OfflineBar } from './components/Banners';

export default function App() {
  return (
    <>
      <Toasts />
      <OfflineBar />
      <CookieBar />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/sobre" element={<Home />} />
          <Route path="/seja-parceiro" element={<BecomePartner />} />
          <Route path="/seguranca" element={<Safety />} />
          <Route path="/termos" element={<Terms />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/diretrizes" element={<Guidelines />} />
          <Route path="/marca" element={<BrandPage />} />
        </Route>

        <Route path="/entrar" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/confirmar-email" element={<RequireAuth><ConfirmEmail /></RequireAuth>} />

        <Route path="/" element={<Navigate to="/explorar" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/explorar" element={<Explore />} />
          <Route path="/parceiro/:id" element={<Profile />} />
          <Route path="/reserva" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/reservas" element={<RequireAuth><Bookings /></RequireAuth>} />
          <Route path="/reservas/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
          <Route path="/reservas/:id/pagar" element={<RequireAuth><Payment /></RequireAuth>} />
          <Route path="/notificacoes" element={<RequireAuth><Notifications /></RequireAuth>} />
          <Route path="/conta/editar" element={<RequireAuth><EditProfile /></RequireAuth>} />
          <Route path="/conta/bloqueados" element={<RequireAuth><Blocked /></RequireAuth>} />
          <Route path="/ajuda" element={<Help />} />
          <Route path="/mensagens" element={<RequireAuth><Messages /></RequireAuth>} />
          <Route path="/mensagens/:id" element={<RequireAuth><Messages /></RequireAuth>} />
          <Route path="/conta" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="/verificacao" element={<RequireAuth><Verify /></RequireAuth>} />
          <Route path="/painel" element={<RequireAuth role="parceiro"><PartnerDashboard /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth role="admin"><Admin /></RequireAuth>} />
        </Route>

        <Route element={<SiteLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
