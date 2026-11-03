import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { Bell, Gift, HelpCircle } from 'lucide-react';
import axios from 'axios';
import API_BASE from './config/api';
import AIAssistantWidget from './components/AIAssistantWidget';
import QuickSearch from './components/QuickSearch';
import TaxNewsNotification from './components/TaxNewsNotification';
import BottomTabBar from './components/BottomTabBar';
import BranchSwitcher from './components/BranchSwitcher';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PushNotifications } from '@capacitor/push-notifications';

function App() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.name || 'Dược sĩ';
  const userPhone = user.phone || 'Nhà Thuốc Nhân Đức';
  const [moTimKiem, setMoTimKiem] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      try {
        StatusBar.setStyle({ style: Style.Light });
        StatusBar.setBackgroundColor({ color: '#ffffff' });

        PushNotifications.requestPermissions().then(result => {
          if (result.receive === 'granted') {
            PushNotifications.register();
          }
        });
        
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push received: ', notification);
        });
      } catch (e) {
        console.log('Native plugin error:', e);
      }
    }

    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMoTimKiem(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!userPhone) return;
    
    const ping = () => {
      axios.post(`${API_BASE}/api/system/ping`, { phone: userPhone, name: userName }).catch(console.error);
    };
    
    ping();
    const interval = setInterval(ping, 10000);
    return () => clearInterval(interval);
  }, [userPhone, userName]);

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--fg)] font-sans overflow-hidden">
      
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-[var(--fg)]/50 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - responsive */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:block`}>
        <Sidebar onClose={() => setMobileMenuOpen(false)} />
      </div>
      
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Generic Top Header */}
        <header className="h-16 bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:gap-4 flex-1">
            <button 
              className="md:hidden p-2 text-[var(--muted)] hover:text-[var(--fg)] rounded-lg hover:bg-[var(--surface-warm)] transition-colors"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            
            {/* Quick Search */}
            <div className="relative w-[240px] md:w-[300px] hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <input
                type="text"
                readOnly
                onFocus={(e) => { e.target.blur(); setMoTimKiem(true); }}
                onClick={() => setMoTimKiem(true)}
                placeholder="Tìm thuốc, hoạt chất, số lô..."
                className="w-full pl-9 pr-16 py-2 bg-[var(--surface-warm)] border border-[var(--border-soft)] rounded-[var(--radius-sm)] text-[var(--text-sm)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-colors cursor-pointer text-[var(--fg)]"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-[11px] font-medium text-[var(--muted)] bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 rounded-[var(--radius-sm)] shadow-sm">Ctrl + K</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Branch Switcher: Chọn quầy thuốc / chi nhánh */}
            <BranchSwitcher />

            <TaxNewsNotification />
            
            <div className="flex items-center gap-3 pl-3 border-l border-[var(--border)] cursor-pointer hover:bg-[var(--surface-warm)] p-1.5 rounded-[var(--radius-md)] transition-colors">
              <div className="w-9 h-9 rounded-[var(--radius-pill)] bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-[var(--elev-raised)]">
                {userName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="text-sm hidden sm:block">
                <div className="font-bold text-[var(--fg)] leading-tight">{userName}</div>
                <div className="text-[var(--muted)] text-[var(--text-xs)]">{userPhone}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 bg-[var(--bg)]">
          <div className="max-w-[1400px] mx-auto h-full flex flex-col relative">
            <Outlet />
            <AIAssistantWidget />
            <QuickSearch open={moTimKiem} onClose={() => setMoTimKiem(false)} />
          </div>
        </div>
      </main>

      {/* Hiển thị thanh Tab Bar đáy nếu là Mobile */}
      <BottomTabBar />
    </div>
  );
}

export default App;
