import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#FAFAFA]">
      <div className="w-full max-w-sm fade-up">
        <img src="/logo.png" alt="logo" className="h-10 w-auto object-contain mb-8" />
        {sent ? (
          <div data-testid="forgot-success">
            <MailCheck className="w-10 h-10 text-emerald-600 mb-4" />
            <h2 className="font-display text-2xl font-bold text-zinc-900">Check your inbox</h2>
            <p className="text-sm text-zinc-500 mt-2">
              If that email is registered, a reset link has been sent. It expires in 1 hour.
            </p>
            <Link to="/login" className="inline-flex items-center gap-2 text-sm text-emerald-700 hover:underline mt-6">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold text-zinc-900">Reset your password</h2>
            <p className="text-sm text-zinc-500 mt-1 mb-8">
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="forgot-email-input"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="submit"
                disabled={loading}
                data-testid="forgot-submit-button"
                className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
            <Link to="/login" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mt-6">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
