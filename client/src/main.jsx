import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/auth.css';
import './styles/admin.css';
import './styles/public.css';
import './styles/recommendation.css';
import './styles/booking.css';
import './styles/payment.css';
import './styles/ticket.css';
import './styles/officer.css';
import './styles/polish.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
