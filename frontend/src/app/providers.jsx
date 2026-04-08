import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "@/context/AppContext.jsx";
import { AuthProvider } from "@/context/AuthContext.jsx";

export default function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>{children}</AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
