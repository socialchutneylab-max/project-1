import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#FAFAFA]">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-950 text-white p-12 relative overflow-hidden">
        <div className="relative z-10">
          <img src="/logo.png" alt="The Social Chutney Co." className="h-16 w-auto object-contain bg-white rounded-lg p-2 inline-block" />
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-4xl font-black tracking-tighter leading-tight mb-4">
            Execution, accountability & daily clarity.
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed">
            One focused internal tool for targets, tasks, deadlines and reviews — so the
            founder and designer are always on the same page.
          </p>
        </div>
        <div className="relative z-10 text-xs text-zinc-500 uppercase tracking-[0.2em] font-bold">
          Internal Operations System
        </div>
        <div
          className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.25), transparent 70%)" }}
        />
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm fade-up">
          <div className="lg:hidden mb-8">
            <img src="/logo.png" alt="logo" className="h-12 w-auto object-contain" />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900">Sign in</h2>
          <p className="text-sm text-zinc-500 mt-1 mb-8">Welcome back. Enter your credentials.</p>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@socialchutney.co"
                required
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-emerald-700 hover:underline" data-testid="forgot-password-link">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                data-testid="login-password-input"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600" data-testid="login-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
