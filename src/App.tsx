
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import VideoPage from "./pages/VideoPage";
import AlertsPage from "./pages/AlertsPage";
import EventsPage from "./pages/EventsPage";
import InsightsPage from "./pages/InsightsPage";
import SettingsPage from "./pages/SettingsPage";
import EdgeComputingPage from "./pages/EdgeComputingPage";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import UserManagementPage from "./pages/UserManagementPage";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";

// Update the AVIANET logo SVG
const updateAvianetLogo = () => {
  const logoSvg = document.querySelector('svg[data-logo="avianet"]');
  if (logoSvg) {
    document.querySelectorAll('.logo-text').forEach(el => {
      if (el.textContent === 'Avianet') {
        el.textContent = 'AVIANET';
      }
    });
  }
};

// Create a custom hook to update all instances of "Avianet" to "AVIANET"
const useUpdateBranding = () => {
  React.useEffect(() => {
    // Update document title
    document.title = document.title.replace(/Avianet/g, 'AVIANET');
    
    // Target specific logo elements with a delay to ensure DOM is loaded
    setTimeout(() => {
      updateAvianetLogo();
      
      // Update all text nodes containing "Avianet" (excluding script and style tags)
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            const parent = node.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tagName = parent.nodeName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') return NodeFilter.FILTER_REJECT;
            if (node.textContent && node.textContent.includes('Avianet')) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      const nodes = [];
      let currentNode;
      while (currentNode = walker.nextNode()) {
        nodes.push(currentNode);
      }
      
      nodes.forEach(node => {
        node.textContent = node.textContent?.replace(/Avianet/g, 'AVIANET');
      });
    }, 100);
  }, []);
};

const queryClient = new QueryClient();

const App = () => {
  useUpdateBranding();
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              <Route element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }>
                <Route path="/" element={<Home />} />
                
                <Route path="/video" element={
                  <ProtectedRoute requiredPermission="view_cameras">
                    <VideoPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/alerts" element={
                  <ProtectedRoute>
                    <AlertsPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/events" element={
                  <ProtectedRoute>
                    <EventsPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/insights" element={
                  <ProtectedRoute>
                    <InsightsPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/edge" element={
                  <ProtectedRoute>
                    <EdgeComputingPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                } />

                <Route path="/profile" element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                } />

                <Route path="/user-management" element={
                  <ProtectedRoute requiredPermission="manage_users">
                    <UserManagementPage />
                  </ProtectedRoute>
                } />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
